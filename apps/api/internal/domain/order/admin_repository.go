package order

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/juancamiloparra/starboy-api/internal/domain/inventory"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

// AdminFilter son los filtros del listado del panel.
type AdminFilter struct {
	Status string
	Search string // código, nombre o correo del cliente
}

// Change es la decisión del servicio sobre una orden ya bloqueada.
type Change struct {
	To             models.OrderStatus
	Note           string
	Carrier        string
	TrackingNumber string
}

// StatusResult informa lo que ocurrió, para que el servicio arme la respuesta.
type StatusResult struct {
	Order     *models.Order
	From      models.OrderStatus
	Stock     string // "", "RELEASED" (reserva liberada) o "RESTOCKED" (unidades repuestas)
	Cancelled bool
}

func likePattern(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(s) + "%"
}

func (r *gormRepository) ListAll(ctx context.Context, f AdminFilter, offset, limit int) ([]models.Order, int64, error) {
	build := func() *gorm.DB {
		q := r.db.WithContext(ctx).Model(&models.Order{})
		if f.Status != "" {
			q = q.Where("status = ?", f.Status)
		}
		if f.Search != "" {
			p := likePattern(f.Search)
			q = q.Where("code ILIKE ? OR customer_email ILIKE ? OR customer_name ILIKE ?", p, p, p)
		}
		return q
	}
	var total int64
	if err := build().Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if total == 0 || offset >= int(total) {
		return []models.Order{}, total, nil
	}
	var items []models.Order
	err := build().Preload("Items", orderedItems).
		Order("created_at DESC, id").Offset(offset).Limit(limit).Find(&items).Error
	return items, total, err
}

func (r *gormRepository) GetForAdmin(ctx context.Context, id uuid.UUID) (*models.Order, error) {
	var o models.Order
	err := r.db.WithContext(ctx).Preload("Items", orderedItems).
		Preload("History", orderedHistory).Preload("History.ChangedBy").
		Where("id = ?", id).First(&o).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errNotFound
	}
	return &o, err
}

func (r *gormRepository) ChangeStatus(ctx context.Context, id, actorID uuid.UUID,
	decide func(*models.Order) (Change, error)) (*StatusResult, error) {
	var res StatusResult
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Mismo orden de bloqueo que el pago aprobado: primero la orden, luego las variantes.
		var o models.Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&o).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errNotFound
			}
			return err
		}
		ch, err := decide(&o)
		if err != nil {
			return err
		}
		res.From = o.Status

		var items []models.OrderItem
		if err := tx.Where("order_id = ?", id).Find(&items).Error; err != nil {
			return err
		}
		lines := make([]inventory.Line, 0, len(items))
		for _, it := range items {
			lines = append(lines, inventory.Line{VariantID: it.VariantID, Quantity: it.Quantity})
		}
		meta := inventory.Meta{OrderID: &id, ActorID: &actorID}
		if ch.To == models.OrderCancelled {
			switch o.Status {
			case models.OrderPendingPayment: // todavía solo reservado
				meta.Reason = "Orden cancelada desde el panel: se libera la reserva"
				if err := inventory.Release(tx, lines, meta); err != nil {
					return err
				}
				res.Stock = "RELEASED"
			case models.OrderPaid, models.OrderProcessing: // ya descontado: vuelve al inventario
				meta.Reason = "Orden pagada cancelada desde el panel: las unidades vuelven al inventario"
				if err := inventory.Restock(tx, lines, meta); err != nil {
					return err
				}
				res.Stock = "RESTOCKED"
			}
			o.ReservedUntil = nil
			res.Cancelled = true
		}

		o.Status, o.UpdatedAt = ch.To, time.Now().UTC()
		cols := []string{"status", "reserved_until", "updated_at"}
		if ch.To == models.OrderShipped {
			o.Carrier, o.TrackingNumber = ch.Carrier, ch.TrackingNumber
			cols = append(cols, "carrier", "tracking_number")
		}
		if err := tx.Select(cols).Where("id = ?", id).Updates(&o).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.OrderStatusHistory{
			OrderID: id, Status: ch.To, Note: ch.Note, ChangedByID: &actorID,
		}).Error; err != nil {
			return err
		}
		res.Order = &o
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &res, nil
}
