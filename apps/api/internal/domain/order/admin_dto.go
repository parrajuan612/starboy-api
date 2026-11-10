package order

import (
	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

const adminMaxLimit = 100

// AdminListQuery: filtros del listado del panel.
type AdminListQuery struct {
	Status string `form:"status" binding:"omitempty,oneof=PENDING_PAYMENT PAID PROCESSING SHIPPED DELIVERED CANCELLED"`
	Q      string `form:"q" binding:"omitempty,max=100"`
	Page   int    `form:"page" binding:"omitempty,gte=1"`
	Limit  int    `form:"limit" binding:"omitempty,gte=1,lte=100"`
}

// UpdateStatusRequest: PENDING_PAYMENT y PAID no se pueden fijar a mano; los mueve el flujo de pago.
type UpdateStatusRequest struct {
	Status         string `json:"status" binding:"required,oneof=PROCESSING SHIPPED DELIVERED CANCELLED"`
	Note           string `json:"note" binding:"omitempty,max=500"`
	Carrier        string `json:"carrier" binding:"omitempty,max=80"`
	TrackingNumber string `json:"tracking_number" binding:"omitempty,max=120"`
}

type AdminHistoryResponse struct {
	HistoryResponse
	ChangedByID   *uuid.UUID `json:"changed_by_id,omitempty"`
	ChangedByName string     `json:"changed_by_name,omitempty"` // vacío = lo hizo el sistema
}

// AdminOrderResponse agrega los datos del cliente y quién hizo cada cambio.
type AdminOrderResponse struct {
	OrderResponse
	UserID           *uuid.UUID             `json:"user_id,omitempty"`
	CustomerName     string                 `json:"customer_name"`
	CustomerEmail    string                 `json:"customer_email"`
	CustomerPhone    string                 `json:"customer_phone,omitempty"`
	CustomerDocument string                 `json:"customer_document,omitempty"`
	AllowedNext      []models.OrderStatus   `json:"allowed_next"`
	History          []AdminHistoryResponse `json:"history,omitempty"`
}

// UpdateStatusResponse es la orden actualizada más lo que pasó con el inventario.
type UpdateStatusResponse struct {
	Order AdminOrderResponse `json:"order"`
	// StockEffect: RELEASED (se liberó la reserva), RESTOCKED (las unidades volvieron al inventario) o vacío.
	StockEffect string `json:"stock_effect,omitempty"`
	// RefundRequired: se canceló una orden ya pagada; el reembolso es manual (no hay pasarela real aún).
	RefundRequired bool `json:"refund_required,omitempty"`
}

// Máquina de estados del panel (SSD §10.1). PAID solo lo alcanza un pago aprobado.
var adminTransitions = map[models.OrderStatus][]models.OrderStatus{
	models.OrderPendingPayment: {models.OrderCancelled},
	models.OrderPaid:           {models.OrderProcessing, models.OrderCancelled},
	models.OrderProcessing:     {models.OrderShipped, models.OrderCancelled},
	models.OrderShipped:        {models.OrderDelivered},
	models.OrderDelivered:      {},
	models.OrderCancelled:      {},
}

func allowedNext(from models.OrderStatus) []models.OrderStatus {
	return append([]models.OrderStatus{}, adminTransitions[from]...)
}

func canMove(from, to models.OrderStatus) bool {
	for _, s := range adminTransitions[from] {
		if s == to {
			return true
		}
	}
	return false
}
