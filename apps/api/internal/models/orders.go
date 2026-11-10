package models

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// OrderStatus es el estado de una orden de la tienda (SSD §10.1).
type OrderStatus string

const (
	OrderPendingPayment OrderStatus = "PENDING_PAYMENT" // stock reservado, esperando el pago
	OrderPaid           OrderStatus = "PAID"            // pago aprobado, stock descontado
	OrderProcessing     OrderStatus = "PROCESSING"
	OrderShipped        OrderStatus = "SHIPPED"
	OrderDelivered      OrderStatus = "DELIVERED"
	OrderCancelled      OrderStatus = "CANCELLED" // incluye reservas vencidas
)

// Order es una compra directa del catálogo local.
type Order struct {
	Base
	Code   string      `gorm:"type:varchar(20);not null;uniqueIndex" json:"code"` // SB-000123 (ver BeforeCreate)
	UserID *uuid.UUID  `gorm:"type:uuid;index" json:"user_id,omitempty"`          // nil = invitado (checkout invitado, más adelante)
	User   *User       `gorm:"constraint:OnDelete:RESTRICT" json:"-"`
	Status OrderStatus `gorm:"type:varchar(20);not null;default:'PENDING_PAYMENT';index;check:chk_orders_status,status IN ('PENDING_PAYMENT','PAID','PROCESSING','SHIPPED','DELIVERED','CANCELLED')" json:"status"`

	CustomerName  string `gorm:"type:varchar(150);not null" json:"customer_name"`
	CustomerEmail string `gorm:"type:varchar(255);not null" json:"customer_email"`
	CustomerPhone string `gorm:"type:varchar(30)" json:"customer_phone,omitempty"`
	// CustomerDocument es la cédula o documento del comprador (facturación y entrega).
	CustomerDocument string `gorm:"type:varchar(30)" json:"-"`

	// IdempotencyKey identifica un intento de compra del cliente: reintentar con la misma llave devuelve
	// la orden ya creada en vez de reservar stock otra vez (doble clic, red caída). Único por usuario.
	IdempotencyKey *string `gorm:"type:varchar(64)" json:"-"`

	SubtotalCOP int64 `gorm:"not null;check:chk_orders_subtotal,subtotal_cop >= 0" json:"subtotal_cop"`
	DiscountCOP int64 `gorm:"not null;default:0" json:"discount_cop"`
	ShippingCOP int64 `gorm:"not null;default:0" json:"shipping_cop"` // tarifas por zona: pendientes (SSD §10.7)
	TotalCOP    int64 `gorm:"not null;check:chk_orders_total,total_cop >= 0" json:"total_cop"`

	ShippingAddress JSONB  `gorm:"not null" json:"shipping_address"` // foto de la dirección al comprar
	Carrier         string `gorm:"type:varchar(80)" json:"carrier,omitempty"`
	TrackingNumber  string `gorm:"type:varchar(120)" json:"tracking_number,omitempty"`
	Notes           string `gorm:"type:text" json:"notes,omitempty"`

	// ReservedUntil: hasta cuándo se garantiza el stock reservado mientras no haya pago.
	ReservedUntil *time.Time `gorm:"index" json:"reserved_until,omitempty"`

	Items   []OrderItem          `gorm:"constraint:OnDelete:CASCADE" json:"items,omitempty"`
	History []OrderStatusHistory `gorm:"constraint:OnDelete:CASCADE" json:"history,omitempty"`
}

// BeforeCreate genera el código legible SB-000123 con una secuencia (order_code_seq, preMigrate §9.2).
func (o *Order) BeforeCreate(tx *gorm.DB) error {
	if o.Code != "" {
		return nil
	}
	var n int64
	if err := tx.Raw("SELECT nextval('order_code_seq')").Scan(&n).Error; err != nil {
		return fmt.Errorf("generar código de orden: %w", err)
	}
	o.Code = fmt.Sprintf("SB-%06d", n)
	return nil
}

// OrderItem es una línea de la orden. Nombre, SKU, talla y precio son una foto del momento de la compra.
type OrderItem struct {
	Base
	OrderID      uuid.UUID       `gorm:"type:uuid;not null;index" json:"order_id"`
	VariantID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"variant_id"`
	Variant      *ProductVariant `gorm:"constraint:OnDelete:RESTRICT" json:"-"`
	ProductName  string          `gorm:"type:varchar(160);not null" json:"product_name"`
	SKU          string          `gorm:"type:varchar(60);not null" json:"sku"`
	Size         string          `gorm:"type:varchar(20);not null" json:"size"`
	Quantity     int             `gorm:"not null;check:chk_order_items_qty,quantity > 0" json:"quantity"`
	UnitPriceCOP int64           `gorm:"not null;check:chk_order_items_price,unit_price_cop >= 0" json:"unit_price_cop"`
}

// OrderStatusHistory es la línea de tiempo de la orden.
type OrderStatusHistory struct {
	Base
	OrderID     uuid.UUID   `gorm:"type:uuid;not null;index" json:"order_id"`
	Status      OrderStatus `gorm:"type:varchar(20);not null" json:"status"`
	Note        string      `gorm:"type:text" json:"note,omitempty"`
	ChangedByID *uuid.UUID  `gorm:"type:uuid" json:"changed_by_id,omitempty"`
	ChangedBy   *User       `gorm:"constraint:OnDelete:SET NULL" json:"-"`
}

// TableName fuerza el singular definido en el SSD (§9.1).
func (OrderStatusHistory) TableName() string { return "order_status_history" }
