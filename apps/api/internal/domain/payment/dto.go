// Package payment registra transacciones de pago y, al confirmarse, avanza el encargo (SSD §10.6).
package payment

import (
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

const (
	defaultLimit = 20
	maxLimit     = 50
)

// CheckoutRequest: se paga una orden de la tienda O el anticipo de un encargo (exactamente uno).
// El monto NO se recibe: sale de la orden o de la cotización aceptada, en el servidor.
type CheckoutRequest struct {
	OrderID         *uuid.UUID `json:"order_id"`
	ImportRequestID *uuid.UUID `json:"import_request_id"`
	Provider        string     `json:"provider" binding:"omitempty,oneof=SANDBOX"` // vacío = SANDBOX; MERCADOPAGO llega con su integración
}

type SimulateRequest struct {
	Outcome string `json:"outcome" binding:"required,oneof=approved declined"`
}

type ListQuery struct {
	Status          string `form:"status" binding:"omitempty,oneof=PENDING IN_REVIEW APPROVED DECLINED REFUNDED"`
	ImportRequestID string `form:"import_request_id" binding:"omitempty,uuid"`
	OrderID         string `form:"order_id" binding:"omitempty,uuid"`
	Page            int    `form:"page" binding:"omitempty,gte=1"`
	Limit           int    `form:"limit" binding:"omitempty,gte=1,lte=50"`
}

type PaymentResponse struct {
	ID              uuid.UUID              `json:"id"`
	ImportRequestID *uuid.UUID             `json:"import_request_id,omitempty"`
	OrderID         *uuid.UUID             `json:"order_id,omitempty"`
	TargetCode      string                 `json:"target_code,omitempty"` // SB-000123 / IMP-000045 (solo en el listado de admin)
	Provider        models.PaymentProvider `json:"provider"`
	ProviderRef     string                 `json:"provider_ref,omitempty"`
	Kind            models.PaymentKind     `json:"kind"`
	AmountCOP       int64                  `json:"amount_cop"`
	Status          models.PaymentStatus   `json:"status"`
	StatusLabel     string                 `json:"status_label"`
	CheckoutURL     string                 `json:"checkout_url,omitempty"` // solo mientras esté pendiente
	CreatedAt       time.Time              `json:"created_at"`
	UpdatedAt       time.Time              `json:"updated_at"`
}

var statusLabels = map[models.PaymentStatus]string{
	models.PaymentPending:  "Pendiente",
	models.PaymentInReview: "En revisión",
	models.PaymentApproved: "Aprobado",
	models.PaymentDeclined: "Rechazado",
	models.PaymentRefunded: "Reembolsado",
}
