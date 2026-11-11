package importreq

import (
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

const (
	defaultLimit = 20
	maxLimit     = 50
)

// ---------- Cotizador ----------

type QuoteItemRequest struct {
	ImportRateID       uuid.UUID `json:"import_rate_id" binding:"required"` // categoría de encargo (GET /imports/rates)
	PriceUSDCents      int64     `json:"price_usd_cents" binding:"required,gt=0,lte=10000000"`
	USShippingUSDCents int64     `json:"us_shipping_usd_cents" binding:"gte=0,lte=10000000"` // por unidad
	Quantity           int       `json:"quantity" binding:"required,gte=1,lte=50"`
}

type QuoteRequest struct {
	Items []QuoteItemRequest `json:"items" binding:"required,min=1,max=10,dive"`
}

// QuoteBreakdown es lo que ve el cliente (§10.4): sin el desglose interno de la tarifa.
type QuoteBreakdown struct {
	ProductCOP     int64 `json:"product_cop"`
	LogisticsCOP   int64 `json:"logistics_cop"`
	ServiceFeeCOP  int64 `json:"service_fee_cop"`
	TaxesCOP       int64 `json:"taxes_cop"`
	TotalCOP       int64 `json:"total_cop"`
	DepositPercent int64 `json:"deposit_percent"`
	DepositCOP     int64 `json:"deposit_cop"`
	BalanceCOP     int64 `json:"balance_cop"`
}

type QuoteResponse struct {
	IsEstimate            bool            `json:"is_estimate"`
	RequiresManualQuote   bool            `json:"requires_manual_quote"`
	Message               string          `json:"message,omitempty"`
	FOBUSDCents           int64           `json:"fob_usd_cents"`
	ExchangeRateCOP       int64           `json:"exchange_rate_cop"`
	TaxExemptThresholdUSD int64           `json:"tax_exempt_threshold_usd"`
	TaxesApplied          bool            `json:"taxes_applied"`
	Breakdown             *QuoteBreakdown `json:"breakdown,omitempty"`
}

type RateResponse struct {
	ID                  uuid.UUID `json:"id"`
	Name                string    `json:"name"`
	FlatFeeCOP          int64     `json:"flat_fee_cop"`
	RequiresManualQuote bool      `json:"requires_manual_quote"`
	Notes               string    `json:"notes,omitempty"`
}

// ---------- Solicitudes ----------

type CreateItemRequest struct {
	ProductURL            string     `json:"product_url" binding:"required,url,max=2000"`
	StoreName             string     `json:"store_name" binding:"omitempty,max=80"`
	Description           string     `json:"description" binding:"required,min=2,max=300"`
	Size                  string     `json:"size" binding:"omitempty,max=20"`
	Color                 string     `json:"color" binding:"omitempty,max=60"`
	Quantity              int        `json:"quantity" binding:"required,gte=1,lte=50"`
	DeclaredPriceUSDCents int64      `json:"declared_price_usd_cents" binding:"gte=0,lte=10000000"`
	ScreenshotURL         string     `json:"screenshot_url" binding:"omitempty,url,max=2000"`
	ImportRateID          *uuid.UUID `json:"import_rate_id"`
}

type CreateRequest struct {
	CustomerNotes string              `json:"customer_notes" binding:"omitempty,max=2000"`
	DocumentID    string              `json:"document_id" binding:"omitempty,alphanum,min=5,max=20"` // cédula; se guarda en el perfil si no la tenía
	Items         []CreateItemRequest `json:"items" binding:"required,min=1,max=10,dive"`
}

type ListQuery struct {
	Status string `form:"status" binding:"omitempty,oneof=REQUESTED QUOTED ACCEPTED PAID PURCHASED IN_US_WAREHOUSE IN_TRANSIT IN_CUSTOMS IN_CO_WAREHOUSE BALANCE_DUE OUT_FOR_DELIVERY DELIVERED REJECTED EXPIRED CANCELLED"`
	Q      string `form:"q" binding:"omitempty,max=30"` // código parcial: IMP-0000
	Page   int    `form:"page" binding:"omitempty,gte=1"`
	Limit  int    `form:"limit" binding:"omitempty,gte=1,lte=50"`
}

type ChangeStatusRequest struct {
	Status         string `json:"status" binding:"required,oneof=REQUESTED QUOTED ACCEPTED PAID PURCHASED IN_US_WAREHOUSE IN_TRANSIT IN_CUSTOMS IN_CO_WAREHOUSE BALANCE_DUE OUT_FOR_DELIVERY DELIVERED REJECTED EXPIRED CANCELLED"`
	Note           string `json:"note" binding:"omitempty,max=1000"` // visible para el cliente en su línea de tiempo
	NotifyCustomer *bool  `json:"notify_customer"`                   // nil = true
	// ConfirmBalanceReceived: para pasar de «Saldo pendiente» a «En reparto» sin pago en la web (transferencia, efectivo o
	// contra entrega acordada), el equipo confirma que recibió el saldo. Queda en el historial.
	ConfirmBalanceReceived bool       `json:"confirm_balance_received"`
	CarrierUSA             *string    `json:"carrier_usa" binding:"omitempty,max=80"`
	TrackingUSA            *string    `json:"tracking_usa" binding:"omitempty,max=120"`
	TrackingCO             *string    `json:"tracking_co" binding:"omitempty,max=120"`
	WeightLb               *float64   `json:"weight_lb" binding:"omitempty,gte=0,lte=1000"`
	ETA                    *time.Time `json:"eta"`
}

// CreateQuoteRequest: el admin emite la cotización formal; los montos salen de los ítems, las
// tarifas por categoría y los parámetros vigentes de settings.
type CreateQuoteRequest struct {
	DepositPercent       *int   `json:"deposit_percent" binding:"omitempty,gte=1,lte=100"` // nil = default de settings
	LogisticsCOPOverride *int64 `json:"logistics_cop_override" binding:"omitempty,gte=0,lte=1000000000"`
	BalanceCODAllowed    bool   `json:"balance_cod_allowed"` // saldo contra entrega; exige anticipo >= 50 % (§10.6)
	NotesCustomer        string `json:"notes_customer" binding:"omitempty,max=1000"`
}

// QuoteSummary es la última cotización del encargo.
type QuoteSummary struct {
	ID                uuid.UUID          `json:"id"`
	Version           int                `json:"version"`
	Status            models.QuoteStatus `json:"status"`
	IsExpired         bool               `json:"is_expired"`
	ProductCOP        int64              `json:"product_cop"`
	LogisticsCOP      int64              `json:"logistics_cop"`
	ServiceFeeCOP     int64              `json:"service_fee_cop"`
	TaxesCOP          int64              `json:"taxes_cop"`
	TotalCOP          int64              `json:"total_cop"`
	TaxesApplied      bool               `json:"taxes_applied"`
	DepositPercent    int                `json:"deposit_percent"`
	DepositCOP        int64              `json:"deposit_cop"`
	BalanceCOP        int64              `json:"balance_cop"`
	BalanceCODAllowed bool               `json:"balance_cod_allowed"`
	ValidUntil        time.Time          `json:"valid_until"`
	NotesCustomer     string             `json:"notes_customer,omitempty"`
}

type ItemResponse struct {
	ID                    uuid.UUID `json:"id"`
	ProductURL            string    `json:"product_url"`
	StoreName             string    `json:"store_name,omitempty"`
	Description           string    `json:"description"`
	Size                  string    `json:"size,omitempty"`
	Color                 string    `json:"color,omitempty"`
	Quantity              int       `json:"quantity"`
	DeclaredPriceUSDCents int64     `json:"declared_price_usd_cents"`
	ScreenshotURL         string    `json:"screenshot_url,omitempty"`
	RateName              string    `json:"rate_name,omitempty"`
}

type HistoryResponse struct {
	Status         models.ImportStatus `json:"status"`
	Label          string              `json:"label"`
	Note           string              `json:"note,omitempty"`
	NotifyCustomer bool                `json:"notify_customer"`
	CreatedAt      time.Time           `json:"created_at"`
}

// CustomerRef solo se llena en las vistas de administración.
type CustomerRef struct {
	ID         uuid.UUID `json:"id"`
	FullName   string    `json:"full_name"`
	Email      string    `json:"email"`
	Phone      string    `json:"phone,omitempty"`
	DocumentID string    `json:"document_id,omitempty"`
}

type RequestResponse struct {
	ID            uuid.UUID           `json:"id"`
	Code          string              `json:"code"`
	Type          models.ImportType   `json:"type"`
	Status        models.ImportStatus `json:"status"`
	StatusLabel   string              `json:"status_label"`
	CustomerNotes string              `json:"customer_notes,omitempty"`
	CarrierUSA    string              `json:"carrier_usa,omitempty"`
	TrackingUSA   string              `json:"tracking_usa,omitempty"`
	TrackingCO    string              `json:"tracking_co,omitempty"`
	WeightLb      float64             `json:"weight_lb"`
	ETA           *time.Time          `json:"eta,omitempty"`
	Customer      *CustomerRef        `json:"customer,omitempty"`
	// AllowedNext (solo panel): estados a los que el equipo puede mover el encargo a mano. Excluye
	// ACCEPTED y PAID (los asigna el flujo del cliente/pago) y QUOTED (se emite con una cotización).
	AllowedNext []models.ImportStatus `json:"allowed_next,omitempty"`
	// BalancePaid: el saldo ya se pagó en la web. BalanceBlocksDispatch (solo panel): el despacho está bloqueado por saldo.
	BalancePaid           bool `json:"balance_paid"`
	BalanceBlocksDispatch bool `json:"balance_blocks_dispatch,omitempty"`
	// RequoteRequestedAt: el cliente pidió una nueva cotización (la anterior venció).
	RequoteRequestedAt *time.Time        `json:"requote_requested_at,omitempty"`
	Quote              *QuoteSummary     `json:"quote,omitempty"` // última cotización
	ItemCount          int               `json:"item_count"`
	Items              []ItemResponse    `json:"items,omitempty"`
	History            []HistoryResponse `json:"history,omitempty"`
	CreatedAt          time.Time         `json:"created_at"`
	UpdatedAt          time.Time         `json:"updated_at"`
}

// ---------- Tarifas por categoría (administración) ----------

// CreateRateRequest: flat_fee_cop NO se recibe; es la suma de los cinco componentes (§10.8).
type CreateRateRequest struct {
	Name                string  `json:"name" binding:"required,min=2,max=80"`
	AvgWeightLb         float64 `json:"avg_weight_lb" binding:"gte=0,lte=9999"`
	FreightCOP          int64   `json:"freight_cop" binding:"gte=0,lte=1000000000"`
	HandlingCOP         int64   `json:"handling_cop" binding:"gte=0,lte=1000000000"`
	InsuranceCOP        int64   `json:"insurance_cop" binding:"gte=0,lte=1000000000"`
	NationalDeliveryCOP int64   `json:"national_delivery_cop" binding:"gte=0,lte=1000000000"`
	MarginCOP           int64   `json:"margin_cop" binding:"gte=0,lte=1000000000"`
	MaxDeclaredUSDCents int64   `json:"max_declared_usd_cents" binding:"gte=0,lte=1000000000"` // 0 = sin tope
	RequiresManualQuote bool    `json:"requires_manual_quote"`
	Notes               string  `json:"notes" binding:"omitempty,max=1000"`
	IsActive            *bool   `json:"is_active"` // nil = true
	SortOrder           int     `json:"sort_order" binding:"gte=0,lte=10000"`
}

type UpdateRateRequest struct {
	Name                *string  `json:"name" binding:"omitempty,min=2,max=80"`
	AvgWeightLb         *float64 `json:"avg_weight_lb" binding:"omitempty,gte=0,lte=9999"`
	FreightCOP          *int64   `json:"freight_cop" binding:"omitempty,gte=0,lte=1000000000"`
	HandlingCOP         *int64   `json:"handling_cop" binding:"omitempty,gte=0,lte=1000000000"`
	InsuranceCOP        *int64   `json:"insurance_cop" binding:"omitempty,gte=0,lte=1000000000"`
	NationalDeliveryCOP *int64   `json:"national_delivery_cop" binding:"omitempty,gte=0,lte=1000000000"`
	MarginCOP           *int64   `json:"margin_cop" binding:"omitempty,gte=0,lte=1000000000"`
	MaxDeclaredUSDCents *int64   `json:"max_declared_usd_cents" binding:"omitempty,gte=0,lte=1000000000"`
	RequiresManualQuote *bool    `json:"requires_manual_quote"`
	Notes               *string  `json:"notes" binding:"omitempty,max=1000"`
	IsActive            *bool    `json:"is_active"`
	SortOrder           *int     `json:"sort_order" binding:"omitempty,gte=0,lte=10000"`
}

// AdminRateResponse muestra el desglose interno de la tarifa (el cliente solo ve flat_fee_cop).
type AdminRateResponse struct {
	ID                  uuid.UUID `json:"id"`
	Name                string    `json:"name"`
	AvgWeightLb         float64   `json:"avg_weight_lb"`
	FreightCOP          int64     `json:"freight_cop"`
	HandlingCOP         int64     `json:"handling_cop"`
	InsuranceCOP        int64     `json:"insurance_cop"`
	NationalDeliveryCOP int64     `json:"national_delivery_cop"`
	MarginCOP           int64     `json:"margin_cop"`
	FlatFeeCOP          int64     `json:"flat_fee_cop"`
	MaxDeclaredUSDCents int64     `json:"max_declared_usd_cents"`
	RequiresManualQuote bool      `json:"requires_manual_quote"`
	Notes               string    `json:"notes,omitempty"`
	IsActive            bool      `json:"is_active"`
	SortOrder           int       `json:"sort_order"`
	UpdatedAt           time.Time `json:"updated_at"`
}
