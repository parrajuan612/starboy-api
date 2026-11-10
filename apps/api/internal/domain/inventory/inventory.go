// Package inventory centraliza las mutaciones de stock (SSD §7: "transacción con bloqueo de fila
// y CHECK en la BD como última defensa"). Todas operan sobre una transacción abierta por el llamante.
//
// Ciclo de vida de una unidad: Reserve (se crea la orden) -> Commit (pago aprobado) o
// Release (orden cancelada o reserva vencida).
package inventory

import (
	"errors"
	"fmt"
	"sort"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

// Meta dice por qué y quién cambia el stock; se guarda en inventory_movements.
type Meta struct {
	OrderID *uuid.UUID // orden asociada (si la hay)
	ActorID *uuid.UUID // usuario que originó el cambio; nil = proceso automático
	Reason  string
}

// Line es una cantidad de una variante.
type Line struct {
	VariantID uuid.UUID
	Quantity  int
}

// Shortage describe una variante sin stock suficiente.
type Shortage struct {
	VariantID uuid.UUID `json:"variant_id"`
	Requested int       `json:"requested"`
	Available int       `json:"available"`
}

// ShortageError se devuelve cuando Reserve no puede cubrir alguna línea; no se modificó nada.
type ShortageError struct{ Shortages []Shortage }

func (e *ShortageError) Error() string {
	return fmt.Sprintf("stock insuficiente en %d variante(s)", len(e.Shortages))
}

// ErrVariantMissing: alguna variante no existe.
var ErrVariantMissing = errors.New("variante inexistente")

// ids devuelve los IDs únicos ordenados. Bloquear siempre en el mismo orden evita deadlocks
// entre transacciones que tocan varias variantes a la vez.
func ids(lines []Line) []uuid.UUID {
	seen := map[uuid.UUID]bool{}
	out := make([]uuid.UUID, 0, len(lines))
	for _, l := range lines {
		if !seen[l.VariantID] {
			seen[l.VariantID] = true
			out = append(out, l.VariantID)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].String() < out[j].String() })
	return out
}

// LockVariants bloquea (FOR UPDATE) las variantes en orden determinista y las devuelve por ID.
func LockVariants(tx *gorm.DB, variantIDs []uuid.UUID) (map[uuid.UUID]models.ProductVariant, error) {
	var vs []models.ProductVariant
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id IN ?", variantIDs).Order("id ASC").Find(&vs).Error; err != nil {
		return nil, err
	}
	m := make(map[uuid.UUID]models.ProductVariant, len(vs))
	for _, v := range vs {
		m[v.ID] = v
	}
	return m, nil
}

func merge(lines []Line) map[uuid.UUID]int {
	m := map[uuid.UUID]int{}
	for _, l := range lines {
		m[l.VariantID] += l.Quantity
	}
	return m
}

// Reserve aumenta stock_reserved si hay disponible suficiente en TODAS las líneas; si falta en
// alguna devuelve *ShortageError y no modifica nada.
func Reserve(tx *gorm.DB, lines []Line, m Meta) error {
	vars, err := LockVariants(tx, ids(lines))
	if err != nil {
		return err
	}
	want := merge(lines)
	var short []Shortage
	for _, id := range ids(lines) {
		v, ok := vars[id]
		if !ok {
			return ErrVariantMissing
		}
		if avail := v.Available(); avail < want[id] {
			short = append(short, Shortage{VariantID: id, Requested: want[id], Available: max(avail, 0)})
		}
	}
	if len(short) > 0 {
		return &ShortageError{Shortages: short}
	}
	return each(lines, func(id uuid.UUID, q int) error {
		return move(tx, id, 0, q, models.MovementReserve, m)
	})
}

// Release devuelve unidades reservadas al disponible (orden cancelada o reserva vencida).
func Release(tx *gorm.DB, lines []Line, m Meta) error {
	return each(lines, func(id uuid.UUID, q int) error {
		return move(tx, id, 0, -q, models.MovementRelease, m)
	})
}

// Commit confirma la venta: descuenta del inventario físico y de lo reservado.
func Commit(tx *gorm.DB, lines []Line, m Meta) error {
	return each(lines, func(id uuid.UUID, q int) error {
		return move(tx, id, -q, -q, models.MovementCommit, m)
	})
}

// Restock devuelve al inventario unidades ya vendidas (se cancela una orden pagada).
func Restock(tx *gorm.DB, lines []Line, m Meta) error {
	return each(lines, func(id uuid.UUID, q int) error {
		return move(tx, id, q, 0, models.MovementRestock, m)
	})
}

// LogAdjustment deja constancia de un cambio manual de stock físico hecho desde el panel. La
// variante ya fue guardada con sus valores finales (dentro de la misma transacción). delta = 0 no registra nada.
func LogAdjustment(tx *gorm.DB, v *models.ProductVariant, delta int, m Meta) error {
	if delta == 0 {
		return nil
	}
	return log(tx, v.ID, delta, 0, v.StockOnHand, v.StockReserved, models.MovementAdjustment, m)
}

func each(lines []Line, fn func(uuid.UUID, int) error) error {
	want := merge(lines)
	for _, id := range ids(lines) {
		if err := fn(id, want[id]); err != nil {
			return err
		}
	}
	return nil
}

// move suma deltas a on_hand y reserved y deja el movimiento, todo dentro de la transacción del
// llamante. El WHERE protege los invariantes (el CHECK de la tabla es la segunda defensa).
func move(tx *gorm.DB, id uuid.UUID, dOnHand, dReserved int, typ models.MovementType, m Meta) error {
	var after struct {
		StockOnHand   int
		StockReserved int
	}
	res := tx.Raw(`UPDATE product_variants
	   SET stock_on_hand = stock_on_hand + ?, stock_reserved = stock_reserved + ?, version = version + 1
	 WHERE id = ? AND stock_on_hand + ? >= 0 AND stock_reserved + ? >= 0
	   AND stock_reserved + ? <= stock_on_hand + ?
	RETURNING stock_on_hand, stock_reserved`,
		dOnHand, dReserved, id, dOnHand, dReserved, dReserved, dOnHand).Scan(&after)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected != 1 {
		return fmt.Errorf("inventario inconsistente en la variante %s (ajuste %+d/%+d)", id, dOnHand, dReserved)
	}
	return log(tx, id, dOnHand, dReserved, after.StockOnHand, after.StockReserved, typ, m)
}

func log(tx *gorm.DB, id uuid.UUID, dOnHand, dReserved, onHand, reserved int, typ models.MovementType, m Meta) error {
	return tx.Create(&models.InventoryMovement{
		VariantID: id, OrderID: m.OrderID, Type: typ,
		DeltaOnHand: dOnHand, DeltaReserved: dReserved, OnHandAfter: onHand, ReservedAfter: reserved,
		Reason: m.Reason, ActorID: m.ActorID,
	}).Error
}
