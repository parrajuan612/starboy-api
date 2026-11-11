// Package settings lee los parámetros de negocio editables (SSD §9.4) con tipos y validación.
package settings

import (
	"context"
	"encoding/json"
	"fmt"

	"gorm.io/gorm"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

// Params es la "foto" de los parámetros de negocio. Se serializa tal cual en import_quotes.params_used.
type Params struct {
	ExchangeRateCOP          int64 `json:"exchange_rate_cop"`
	TaxExemptThresholdUSD    int64 `json:"tax_exempt_threshold_usd"`
	TariffPercent            int64 `json:"tariff_percent"`
	VATPercent               int64 `json:"vat_percent"`
	ServiceFeePercent        int64 `json:"service_fee_percent"`
	ServiceFeeMinCOP         int64 `json:"service_fee_min_cop"`
	DefaultDepositPercent    int64 `json:"default_deposit_percent"`
	QuoteValidityHours       int64 `json:"quote_validity_hours"`
	FreeShippingThresholdCOP int64 `json:"free_shipping_threshold_cop"`
}

// Spec describe un parámetro editable: su rango válido y cómo mostrarlo en el panel.
type Spec struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Help  string `json:"help"`
	Unit  string `json:"unit"` // "COP", "USD", "%", "h" o "" (número)
	Min   int64  `json:"min"`
	Max   int64  `json:"max"`
}

// Specs es la fuente única de los parámetros de negocio (SSD §9.4): la lectura (Params) y la edición
// (AdminService) validan contra los mismos rangos, así un valor guardado siempre se puede leer.
var Specs = []Spec{
	{models.SettingExchangeRateCOP, "Dólar (TRM Starboy)", "Pesos por cada dólar. Se usa en la calculadora y en cada cotización.", "COP", 1, 100_000},
	{models.SettingTaxExemptThresholdUSD, "Umbral sin impuestos", "Si el valor del producto supera este monto en USD, se cobran arancel e IVA. Confírmalo con el courier o un agente de aduanas (USD 200 o 50).", "USD", 0, 100_000},
	{models.SettingTariffPercent, "Arancel", "Porcentaje que se suma cuando se supera el umbral.", "%", 0, 100},
	{models.SettingVATPercent, "IVA", "Porcentaje que se suma cuando se supera el umbral.", "%", 0, 100},
	{models.SettingServiceFeePercent, "Comisión de servicio", "Porcentaje sobre el valor del producto.", "%", 0, 100},
	{models.SettingServiceFeeMinCOP, "Comisión mínima", "La comisión nunca baja de este valor.", "COP", 0, 1_000_000_000},
	{models.SettingDefaultDepositPercent, "Anticipo por defecto", "Porcentaje que se cobra al aceptar la cotización. Puedes cambiarlo en cada cotización.", "%", 0, 100},
	{models.SettingQuoteValidityHours, "Vigencia de la cotización", "Horas que la cotización sigue válida (48 = dos días).", "h", 1, 24 * 90},
	{models.SettingFreeShippingThresholdCOP, "Envío gratis desde", "Subtotal desde el cual el envío nacional es gratis.", "COP", 0, 1_000_000_000},
}

// Reader lee las filas crudas de la tabla settings.
type Reader interface {
	All(ctx context.Context) (map[string]models.JSONB, error)
}

type gormReader struct{ db *gorm.DB }

// NewReader crea el lector GORM.
func NewReader(db *gorm.DB) Reader { return &gormReader{db: db} }

func (r *gormReader) All(ctx context.Context) (map[string]models.JSONB, error) {
	var rows []models.Setting
	if err := r.db.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]models.JSONB, len(rows))
	for _, s := range rows {
		out[s.Key] = s.Value
	}
	return out, nil
}

// Service entrega los parámetros ya validados.
type Service struct{ reader Reader }

// NewService crea el servicio.
func NewService(reader Reader) *Service { return &Service{reader: reader} }

// Params lee settings en cada llamada (el admin puede cambiarlos en cualquier momento).
// Un parámetro faltante o fuera de rango es un error de configuración: se registra y el cliente
// recibe un error genérico, nunca un cálculo con valores inventados.
func (s *Service) Params(ctx context.Context) (Params, error) {
	raw, err := s.reader.All(ctx)
	if err != nil {
		return Params{}, apperr.Internal(err)
	}
	var p Params
	dst := map[string]*int64{
		models.SettingExchangeRateCOP: &p.ExchangeRateCOP, models.SettingTaxExemptThresholdUSD: &p.TaxExemptThresholdUSD,
		models.SettingTariffPercent: &p.TariffPercent, models.SettingVATPercent: &p.VATPercent,
		models.SettingServiceFeePercent: &p.ServiceFeePercent, models.SettingServiceFeeMinCOP: &p.ServiceFeeMinCOP,
		models.SettingDefaultDepositPercent: &p.DefaultDepositPercent, models.SettingQuoteValidityHours: &p.QuoteValidityHours,
		models.SettingFreeShippingThresholdCOP: &p.FreeShippingThresholdCOP,
	}
	type field struct {
		key      string
		dst      *int64
		min, max int64
	}
	fields := make([]field, 0, len(Specs))
	for _, sp := range Specs {
		fields = append(fields, field{sp.Key, dst[sp.Key], sp.Min, sp.Max})
	}
	for _, f := range fields {
		v, ok := raw[f.key]
		if !ok {
			return Params{}, apperr.Internal(fmt.Errorf("ajuste %q no existe: corre el seed", f.key))
		}
		if err := json.Unmarshal(v, f.dst); err != nil {
			return Params{}, apperr.Internal(fmt.Errorf("ajuste %q debe ser un entero: %w", f.key, err))
		}
		if *f.dst < f.min || *f.dst > f.max {
			return Params{}, apperr.Internal(fmt.Errorf("ajuste %q fuera de rango (%d..%d): %d", f.key, f.min, f.max, *f.dst))
		}
	}
	return p, nil
}
