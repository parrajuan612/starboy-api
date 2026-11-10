// Package order implementa las compras directas del catálogo local (SSD §10.1).
package order

import (
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

const (
	defaultLimit = 20
	maxLimit     = 50

	// ReservationTTL: cuánto se guarda el stock mientras se paga (SSD §10.1: Mercado Pago 30 min).
	ReservationTTL = 30 * 60 // segundos
)

type ItemRequest struct {
	VariantID uuid.UUID `json:"variant_id" binding:"required"`
	Quantity  int       `json:"quantity" binding:"required,gte=1,lte=10"`
}

// AddressRequest es la dirección de envío; se guarda como foto en la orden.
type AddressRequest struct {
	RecipientName string `json:"recipient_name" binding:"required,min=2,max=150"`
	Phone         string `json:"phone" binding:"required,min=7,max=30"`
	Department    string `json:"department" binding:"required,max=80"`
	City          string `json:"city" binding:"required,max=80"`
	DaneCode      string `json:"dane_code" binding:"omitempty,max=10"`
	Line1         string `json:"line1" binding:"required,min=3,max=200"`
	Line2         string `json:"line2" binding:"omitempty,max=200"`
	Notes         string `json:"notes" binding:"omitempty,max=300"`
}

// CreateRequest: precios y totales NO se reciben; se calculan en el servidor con el catálogo vigente.
type CreateRequest struct {
	Items           []ItemRequest  `json:"items" binding:"required,min=1,max=20,dive"`
	DocumentID      string         `json:"document_id" binding:"required,min=5,max=20"` // cédula o documento (alfanumérico)
	ShippingAddress AddressRequest `json:"shipping_address"`
	Notes           string         `json:"notes" binding:"omitempty,max=500"`
}

type ListQuery struct {
	Status string `form:"status" binding:"omitempty,oneof=PENDING_PAYMENT PAID PROCESSING SHIPPED DELIVERED CANCELLED"`
	Page   int    `form:"page" binding:"omitempty,gte=1"`
	Limit  int    `form:"limit" binding:"omitempty,gte=1,lte=50"`
}

type ItemResponse struct {
	VariantID    uuid.UUID `json:"variant_id"`
	ProductName  string    `json:"product_name"`
	SKU          string    `json:"sku"`
	Size         string    `json:"size"`
	Quantity     int       `json:"quantity"`
	UnitPriceCOP int64     `json:"unit_price_cop"`
	LineTotalCOP int64     `json:"line_total_cop"`
}

type HistoryResponse struct {
	Status    models.OrderStatus `json:"status"`
	Label     string             `json:"label"`
	Note      string             `json:"note,omitempty"`
	CreatedAt time.Time          `json:"created_at"`
}

type OrderResponse struct {
	ID              uuid.UUID          `json:"id"`
	Code            string             `json:"code"`
	Status          models.OrderStatus `json:"status"`
	StatusLabel     string             `json:"status_label"`
	SubtotalCOP     int64              `json:"subtotal_cop"`
	DiscountCOP     int64              `json:"discount_cop"`
	ShippingCOP     int64              `json:"shipping_cop"`
	TotalCOP        int64              `json:"total_cop"`
	ShippingAddress models.JSONB       `json:"shipping_address"`
	Notes           string             `json:"notes,omitempty"`
	ReservedUntil   *time.Time         `json:"reserved_until,omitempty"`
	CarrierName     string             `json:"carrier,omitempty"`
	TrackingNumber  string             `json:"tracking_number,omitempty"`
	ItemCount       int                `json:"item_count"`
	Items           []ItemResponse     `json:"items"`
	History         []HistoryResponse  `json:"history,omitempty"`
	CreatedAt       time.Time          `json:"created_at"`
	UpdatedAt       time.Time          `json:"updated_at"`
}

var statusLabels = map[models.OrderStatus]string{
	models.OrderPendingPayment: "Pendiente de pago",
	models.OrderPaid:           "Pagada",
	models.OrderProcessing:     "En preparación",
	models.OrderShipped:        "Enviada",
	models.OrderDelivered:      "Entregada",
	models.OrderCancelled:      "Cancelada",
}
