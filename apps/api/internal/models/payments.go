package models

import "github.com/google/uuid"

// PaymentProvider es la pasarela o método de pago (SSD §6).
type PaymentProvider string

const (
	ProviderMercadoPago    PaymentProvider = "MERCADOPAGO"
	ProviderBankTransfer   PaymentProvider = "BANK_TRANSFER"
	ProviderCashOnDelivery PaymentProvider = "CASH_ON_DELIVERY"
	ProviderSandbox        PaymentProvider = "SANDBOX" // pasarela simulada, solo fuera de producción
)

// PaymentKind indica qué parte del total se está pagando.
type PaymentKind string

const (
	PaymentFull    PaymentKind = "FULL"
	PaymentDeposit PaymentKind = "DEPOSIT" // anticipo de un encargo
	PaymentBalance PaymentKind = "BALANCE" // saldo de un encargo
)

// PaymentStatus es el estado de la transacción.
type PaymentStatus string

const (
	PaymentPending  PaymentStatus = "PENDING"
	PaymentInReview PaymentStatus = "IN_REVIEW" // requiere revisión manual del admin
	PaymentApproved PaymentStatus = "APPROVED"
	PaymentDeclined PaymentStatus = "DECLINED"
	PaymentRefunded PaymentStatus = "REFUNDED"
)

// Payment es una transacción de pago asociada a un pedido o a un encargo (exactamente uno).
//
// Un pago pertenece a una orden de la tienda o a un encargo, nunca a ambos.
type Payment struct {
	Base
	OrderID         *uuid.UUID     `gorm:"type:uuid;index;check:chk_payments_target,(order_id IS NULL) <> (import_request_id IS NULL)" json:"order_id,omitempty"`
	Order           *Order         `gorm:"constraint:OnDelete:RESTRICT" json:"-"`
	ImportRequestID *uuid.UUID     `gorm:"type:uuid;index" json:"import_request_id,omitempty"`
	ImportRequest   *ImportRequest `gorm:"constraint:OnDelete:RESTRICT" json:"-"`

	Provider    PaymentProvider `gorm:"type:varchar(20);not null;check:chk_payments_provider,provider IN ('MERCADOPAGO','BANK_TRANSFER','CASH_ON_DELIVERY','SANDBOX')" json:"provider"`
	ProviderRef *string         `gorm:"type:varchar(120);uniqueIndex" json:"provider_ref,omitempty"` // id en la pasarela; único
	Kind        PaymentKind     `gorm:"type:varchar(10);not null;check:chk_payments_kind,kind IN ('FULL','DEPOSIT','BALANCE')" json:"kind"`
	AmountCOP   int64           `gorm:"not null;check:chk_payments_amount,amount_cop > 0" json:"amount_cop"`
	Status      PaymentStatus   `gorm:"type:varchar(12);not null;default:'PENDING';index;check:chk_payments_status,status IN ('PENDING','IN_REVIEW','APPROVED','DECLINED','REFUNDED')" json:"status"`

	ReceiptURL   string     `gorm:"type:text" json:"receipt_url,omitempty"`
	ReviewedByID *uuid.UUID `gorm:"type:uuid" json:"reviewed_by_id,omitempty"`
	ReviewedBy   *User      `gorm:"constraint:OnDelete:SET NULL" json:"-"`
	RawPayload   JSONB      `json:"-"` // respuesta cruda de la pasarela (auditoría)
}
