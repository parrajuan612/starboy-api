package models

import "time"

// Setting es un parámetro de negocio editable desde el admin (clave → valor JSON).
type Setting struct {
	Key         string    `gorm:"type:varchar(80);primaryKey" json:"key"`
	Value       JSONB     `gorm:"not null" json:"value"`
	Description string    `gorm:"type:varchar(255)" json:"description,omitempty"`
	UpdatedAt   time.Time `gorm:"not null" json:"updated_at"`
}

// Claves conocidas por el sistema (valores iniciales en §9.4).
const (
	SettingExchangeRateCOP          = "exchange_rate_cop"
	SettingTaxExemptThresholdUSD    = "tax_exempt_threshold_usd" // 200 o 50 según aduanas
	SettingTariffPercent            = "tariff_percent"
	SettingVATPercent               = "vat_percent"
	SettingServiceFeePercent        = "service_fee_percent"
	SettingServiceFeeMinCOP         = "service_fee_min_cop"
	SettingDefaultDepositPercent    = "default_deposit_percent"
	SettingQuoteValidityHours       = "quote_validity_hours" // 48
	SettingFreeShippingThresholdCOP = "free_shipping_threshold_cop"
)
