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
	fields := []struct {
		key      string
		dst      *int64
		min, max int64
	}{
		{models.SettingExchangeRateCOP, &p.ExchangeRateCOP, 1, 100_000},
		{models.SettingTaxExemptThresholdUSD, &p.TaxExemptThresholdUSD, 0, 100_000},
		{models.SettingTariffPercent, &p.TariffPercent, 0, 100},
		{models.SettingVATPercent, &p.VATPercent, 0, 100},
		{models.SettingServiceFeePercent, &p.ServiceFeePercent, 0, 100},
		{models.SettingServiceFeeMinCOP, &p.ServiceFeeMinCOP, 0, 1_000_000_000},
		{models.SettingDefaultDepositPercent, &p.DefaultDepositPercent, 0, 100},
		{models.SettingQuoteValidityHours, &p.QuoteValidityHours, 1, 24 * 90},
		{models.SettingFreeShippingThresholdCOP, &p.FreeShippingThresholdCOP, 0, 1_000_000_000},
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
