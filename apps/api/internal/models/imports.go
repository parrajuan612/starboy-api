package models

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ImportType distingue un encargo de cliente de un lote propio de Starboy.
type ImportType string

const (
	ImportCustomerOrder ImportType = "CUSTOMER_ORDER" // el cliente pide algo por link
	ImportStoreRestock  ImportType = "STORE_RESTOCK"  // Starboy trae mercancía para vender
)

// ImportStatus es el estado del encargo (SSD §10.3). El texto visible está en §10.3.
type ImportStatus string

const (
	ImportRequested      ImportStatus = "REQUESTED"
	ImportQuoted         ImportStatus = "QUOTED"
	ImportAccepted       ImportStatus = "ACCEPTED"
	ImportPaid           ImportStatus = "PAID"
	ImportPurchased      ImportStatus = "PURCHASED"
	ImportInUSWarehouse  ImportStatus = "IN_US_WAREHOUSE"
	ImportInTransit      ImportStatus = "IN_TRANSIT"
	ImportInCustoms      ImportStatus = "IN_CUSTOMS"
	ImportInCOWarehouse  ImportStatus = "IN_CO_WAREHOUSE"
	ImportBalanceDue     ImportStatus = "BALANCE_DUE"
	ImportOutForDelivery ImportStatus = "OUT_FOR_DELIVERY"
	ImportDelivered      ImportStatus = "DELIVERED"
	ImportRejected       ImportStatus = "REJECTED"
	ImportExpired        ImportStatus = "EXPIRED"
	ImportCancelled      ImportStatus = "CANCELLED"
)

// importTransitions define los cambios de estado válidos (diagrama §10.3).
var importTransitions = map[ImportStatus][]ImportStatus{
	ImportRequested:      {ImportQuoted, ImportRejected, ImportPurchased}, // Purchased directo = lote propio
	ImportQuoted:         {ImportQuoted, ImportAccepted, ImportExpired, ImportRejected},
	ImportExpired:        {ImportQuoted},
	ImportAccepted:       {ImportPaid, ImportCancelled},
	ImportPaid:           {ImportPurchased, ImportCancelled},
	ImportPurchased:      {ImportInUSWarehouse, ImportCancelled},
	ImportInUSWarehouse:  {ImportInTransit},
	ImportInTransit:      {ImportInCustoms, ImportInCOWarehouse},
	ImportInCustoms:      {ImportInCOWarehouse},
	ImportInCOWarehouse:  {ImportBalanceDue, ImportOutForDelivery, ImportDelivered},
	ImportBalanceDue:     {ImportOutForDelivery},
	ImportOutForDelivery: {ImportDelivered},
}

// CanTransition valida un cambio de estado antes de guardarlo.
func CanTransition(from, to ImportStatus) bool {
	for _, s := range importTransitions[from] {
		if s == to {
			return true
		}
	}
	return false
}

// AllowedTransitions devuelve los estados a los que se puede pasar desde "from" (vacío si es terminal).
func AllowedTransitions(from ImportStatus) []ImportStatus {
	return append([]ImportStatus{}, importTransitions[from]...) // nunca nil: el JSON sale como []
}

// ImportRequest es un encargo USA (de un cliente) o un lote propio de Starboy.
type ImportRequest struct {
	Base
	Code   string       `gorm:"type:varchar(20);not null;uniqueIndex" json:"code"` // IMP-000001 (ver BeforeCreate)
	UserID *uuid.UUID   `gorm:"type:uuid;index" json:"user_id,omitempty"`          // nil = lote propio
	User   *User        `gorm:"constraint:OnDelete:RESTRICT" json:"user,omitempty"`
	Type   ImportType   `gorm:"type:varchar(20);not null;default:'CUSTOMER_ORDER';check:chk_import_type,type IN ('CUSTOMER_ORDER','STORE_RESTOCK')" json:"type"`
	Status ImportStatus `gorm:"type:varchar(20);not null;default:'REQUESTED';index;check:chk_import_status,status IN ('REQUESTED','QUOTED','ACCEPTED','PAID','PURCHASED','IN_US_WAREHOUSE','IN_TRANSIT','IN_CUSTOMS','IN_CO_WAREHOUSE','BALANCE_DUE','OUT_FOR_DELIVERY','DELIVERED','REJECTED','EXPIRED','CANCELLED')" json:"status"`

	CustomerNotes string     `gorm:"type:text" json:"customer_notes,omitempty"`
	InternalNotes string     `gorm:"type:text" json:"-"`
	CarrierUSA    string     `gorm:"type:varchar(80)" json:"carrier_usa,omitempty"`
	TrackingUSA   string     `gorm:"type:varchar(120)" json:"tracking_usa,omitempty"`
	TrackingCO    string     `gorm:"type:varchar(120)" json:"tracking_co,omitempty"`
	WeightLb      float64    `gorm:"type:numeric(8,2);not null;default:0" json:"weight_lb"` // peso real, no es dinero
	ETA           *time.Time `json:"eta,omitempty"`

	Items   []ImportRequestItem   `gorm:"constraint:OnDelete:CASCADE" json:"items,omitempty"`
	Quotes  []ImportQuote         `gorm:"constraint:OnDelete:CASCADE" json:"quotes,omitempty"`
	History []ImportStatusHistory `gorm:"constraint:OnDelete:CASCADE" json:"history,omitempty"`
}

// BeforeCreate genera el código legible IMP-000001 con una secuencia de PostgreSQL.
// La secuencia import_request_code_seq se crea en preMigrate (§9.2).
func (r *ImportRequest) BeforeCreate(tx *gorm.DB) error {
	if r.Code != "" {
		return nil
	}
	var n int64
	if err := tx.Raw("SELECT nextval('import_request_code_seq')").Scan(&n).Error; err != nil {
		return fmt.Errorf("generar código de encargo: %w", err)
	}
	r.Code = fmt.Sprintf("IMP-%06d", n)
	return nil
}

// ImportRequestItem es cada producto solicitado dentro del encargo.
type ImportRequestItem struct {
	Base
	ImportRequestID       uuid.UUID   `gorm:"type:uuid;not null;index" json:"import_request_id"`
	ProductURL            string      `gorm:"type:text;not null" json:"product_url"`
	StoreName             string      `gorm:"type:varchar(80)" json:"store_name,omitempty"` // Nike.com, Amazon, Foot Locker…
	Description           string      `gorm:"type:varchar(300);not null" json:"description"`
	Size                  string      `gorm:"type:varchar(20)" json:"size,omitempty"`
	Color                 string      `gorm:"type:varchar(60)" json:"color,omitempty"`
	Quantity              int         `gorm:"not null;default:1;check:chk_import_items_qty,quantity > 0" json:"quantity"`
	DeclaredPriceUSDCents int64       `gorm:"not null;default:0;check:chk_import_items_price,declared_price_usd_cents >= 0" json:"declared_price_usd_cents"`
	ScreenshotURL         string      `gorm:"type:text" json:"screenshot_url,omitempty"`
	ImportRateID          *uuid.UUID  `gorm:"type:uuid;index" json:"import_rate_id,omitempty"`
	ImportRate            *ImportRate `gorm:"constraint:OnDelete:SET NULL" json:"import_rate,omitempty"`
	ConvertedProductID    *uuid.UUID  `gorm:"type:uuid" json:"converted_product_id,omitempty"` // si pasó a stock en venta
	ConvertedProduct      *Product    `gorm:"constraint:OnDelete:SET NULL" json:"-"`
}

// QuoteStatus es el estado de una cotización.
type QuoteStatus string

const (
	QuoteSent     QuoteStatus = "SENT"
	QuoteAccepted QuoteStatus = "ACCEPTED"
	QuoteRejected QuoteStatus = "REJECTED"
	QuoteExpired  QuoteStatus = "EXPIRED"
)

// DefaultQuoteValidity es el respaldo si el servicio no fija la vigencia.
// El valor real sale de settings.quote_validity_hours (ADR-016).
const DefaultQuoteValidity = 48 * time.Hour

// ImportQuote es una cotización versionada con "foto" de los parámetros usados.
type ImportQuote struct {
	Base
	ImportRequestID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:uq_quote_request_version" json:"import_request_id"`
	Version         int       `gorm:"not null;default:1;uniqueIndex:uq_quote_request_version" json:"version"`

	ProductCostUSDCents int64 `gorm:"not null;default:0" json:"product_cost_usd_cents"`
	USShippingUSDCents  int64 `gorm:"not null;default:0" json:"us_shipping_usd_cents"`
	ExchangeRateCOP     int64 `gorm:"not null;check:chk_quotes_trm,exchange_rate_cop > 0" json:"exchange_rate_cop"` // pesos por 1 USD

	ProductCOP    int64 `gorm:"not null;default:0" json:"product_cop"`
	LogisticsCOP  int64 `gorm:"not null;default:0" json:"logistics_cop"` // suma de tarifas fijas por categoría
	ServiceFeeCOP int64 `gorm:"not null;default:0" json:"service_fee_cop"`
	TaxesCOP      int64 `gorm:"not null;default:0" json:"taxes_cop"`
	TotalCOP      int64 `gorm:"not null;check:chk_quotes_total,total_cop >= 0" json:"total_cop"`

	DepositPercent    int   `gorm:"not null;default:50;check:chk_quotes_deposit,deposit_percent BETWEEN 0 AND 100" json:"deposit_percent"`
	DepositCOP        int64 `gorm:"not null;default:0" json:"deposit_cop"`
	BalanceCOP        int64 `gorm:"not null;default:0" json:"balance_cop"`
	BalanceCODAllowed bool  `gorm:"not null;default:false" json:"balance_cod_allowed"` // saldo contra entrega (excepción)

	TaxesApplied  bool        `gorm:"not null;default:false" json:"taxes_applied"`
	ParamsUsed    JSONB       `json:"params_used,omitempty"` // TRM, umbral, %, tarifas usados en el cálculo
	ValidUntil    time.Time   `gorm:"not null;index" json:"valid_until"`
	Status        QuoteStatus `gorm:"type:varchar(10);not null;default:'SENT';index;check:chk_quotes_status,status IN ('SENT','ACCEPTED','REJECTED','EXPIRED')" json:"status"`
	NotesCustomer string      `gorm:"type:text" json:"notes_customer,omitempty"`
	CreatedByID   *uuid.UUID  `gorm:"type:uuid" json:"created_by_id,omitempty"`
	CreatedBy     *User       `gorm:"constraint:OnDelete:SET NULL" json:"-"`
}

// BeforeCreate aplica la vigencia por defecto (48 h) si el servicio no la definió.
func (q *ImportQuote) BeforeCreate(_ *gorm.DB) error {
	if q.ValidUntil.IsZero() {
		q.ValidUntil = time.Now().UTC().Add(DefaultQuoteValidity)
	}
	return nil
}

// IsExpired indica si la cotización ya venció.
func (q ImportQuote) IsExpired(now time.Time) bool { return now.After(q.ValidUntil) }

// ImportStatusHistory es la línea de tiempo que ve el cliente en "Rastreo".
type ImportStatusHistory struct {
	Base
	ImportRequestID uuid.UUID    `gorm:"type:uuid;not null;index" json:"import_request_id"`
	Status          ImportStatus `gorm:"type:varchar(20);not null;check:chk_import_history_status,status IN ('REQUESTED','QUOTED','ACCEPTED','PAID','PURCHASED','IN_US_WAREHOUSE','IN_TRANSIT','IN_CUSTOMS','IN_CO_WAREHOUSE','BALANCE_DUE','OUT_FOR_DELIVERY','DELIVERED','REJECTED','EXPIRED','CANCELLED')" json:"status"`
	Note            string       `gorm:"type:text" json:"note,omitempty"`
	NotifyCustomer  bool         `gorm:"not null;default:true" json:"notify_customer"`
	ChangedByID     *uuid.UUID   `gorm:"type:uuid" json:"changed_by_id,omitempty"`
	ChangedBy       *User        `gorm:"constraint:OnDelete:SET NULL" json:"-"`
}

// ImportRate es la tarifa fija por categoría de encargo (ADR-010).
// El cliente ve FlatFeeCOP; el admin ve el desglose.
type ImportRate struct {
	Base
	Name                string  `gorm:"type:varchar(80);not null;uniqueIndex" json:"name"`
	AvgWeightLb         float64 `gorm:"type:numeric(6,2);not null;default:0" json:"avg_weight_lb"`
	FreightCOP          int64   `gorm:"not null;default:0" json:"freight_cop"`
	HandlingCOP         int64   `gorm:"not null;default:0" json:"handling_cop"`
	InsuranceCOP        int64   `gorm:"not null;default:0" json:"insurance_cop"`
	NationalDeliveryCOP int64   `gorm:"not null;default:0" json:"national_delivery_cop"`
	MarginCOP           int64   `gorm:"not null;default:0" json:"margin_cop"`
	FlatFeeCOP          int64   `gorm:"not null;default:0" json:"flat_fee_cop"`
	MaxDeclaredUSDCents int64   `gorm:"not null;default:0" json:"max_declared_usd_cents"` // 0 = sin tope
	RequiresManualQuote bool    `gorm:"not null;default:false" json:"requires_manual_quote"`
	Notes               string  `gorm:"type:text" json:"notes,omitempty"`
	IsActive            bool    `gorm:"not null;default:true" json:"is_active"`
	SortOrder           int     `gorm:"not null;default:0" json:"sort_order"`
}

// BeforeSave recalcula el total desde el desglose, así nunca queda descuadrado.
func (r *ImportRate) BeforeSave(_ *gorm.DB) error {
	r.FlatFeeCOP = r.FreightCOP + r.HandlingCOP + r.InsuranceCOP + r.NationalDeliveryCOP + r.MarginCOP
	return nil
}

// TableName fuerza el nombre singular definido en el SSD (§9.1) en lugar del plural automático de GORM.
func (ImportStatusHistory) TableName() string { return "import_status_history" }
