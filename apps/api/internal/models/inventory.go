package models

import (
	"time"

	"github.com/google/uuid"
)

// MovementType clasifica un cambio de stock.
type MovementType string

const (
	MovementReserve    MovementType = "RESERVE"    // se crea una orden: sube stock_reserved
	MovementRelease    MovementType = "RELEASE"    // orden cancelada o reserva vencida: baja stock_reserved
	MovementCommit     MovementType = "COMMIT"     // pago aprobado: baja stock_on_hand y stock_reserved
	MovementRestock    MovementType = "RESTOCK"    // orden pagada que se cancela: las unidades vuelven al inventario
	MovementAdjustment MovementType = "ADJUSTMENT" // el panel cambia el stock a mano (alta de variante o edición)
)

// InventoryMovement es el libro de auditoría del inventario (SSD §9.1): una fila por cada cambio de
// stock de una variante. Es de solo inserción (un trigger de la BD rechaza UPDATE y DELETE), así que
// sirve para reconstruir cuántas unidades había en cualquier momento y quién las movió.
//
// order_id no lleva llave foránea a propósito: la bitácora no debe depender del ciclo de vida de la orden.
type InventoryMovement struct {
	ID        uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CreatedAt time.Time       `gorm:"not null;index:idx_inv_mov_variant_created,priority:2,sort:desc" json:"created_at"`
	VariantID uuid.UUID       `gorm:"type:uuid;not null;index:idx_inv_mov_variant_created,priority:1" json:"variant_id"`
	Variant   *ProductVariant `gorm:"constraint:OnDelete:RESTRICT" json:"-"`
	OrderID   *uuid.UUID      `gorm:"type:uuid;index" json:"order_id,omitempty"`
	Type      MovementType    `gorm:"type:varchar(12);not null;index;check:chk_inv_mov_type,type IN ('RESERVE','RELEASE','COMMIT','RESTOCK','ADJUSTMENT')" json:"type"`

	DeltaOnHand   int `gorm:"not null" json:"delta_on_hand"`
	DeltaReserved int `gorm:"not null" json:"delta_reserved"`
	OnHandAfter   int `gorm:"not null" json:"on_hand_after"`
	ReservedAfter int `gorm:"not null" json:"reserved_after"`

	Reason  string     `gorm:"type:text" json:"reason,omitempty"`
	ActorID *uuid.UUID `gorm:"type:uuid;index" json:"actor_id,omitempty"` // nil = proceso automático (job, webhook de pago)
	Actor   *User      `gorm:"foreignKey:ActorID;constraint:OnDelete:SET NULL" json:"-"`
}
