package importreq

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

func rateExists() *apperr.Error {
	return apperr.New(apperr.KindConflict, "RATE_EXISTS", "Ya existe una tarifa con ese nombre.")
}

func rateNotFound() *apperr.Error {
	return apperr.New(apperr.KindNotFound, "RATE_NOT_FOUND", "No encontramos esa tarifa.")
}

// recalc deja flat_fee_cop = suma del desglose, igual que el hook BeforeSave del modelo.
// Se calcula aquí también porque el UPDATE con columnas explícitas no depende de los hooks.
func recalc(r *models.ImportRate) {
	r.FlatFeeCOP = r.FreightCOP + r.HandlingCOP + r.InsuranceCOP + r.NationalDeliveryCOP + r.MarginCOP
}

func round2(f float64) float64 { return math.Round(f*100) / 100 } // numeric(6,2)

// ListAllRates devuelve todas las tarifas (también las inactivas) con su desglose.
func (s *Service) ListAllRates(ctx context.Context) ([]AdminRateResponse, error) {
	rates, err := s.repo.ListAllRates(ctx)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	out := make([]AdminRateResponse, 0, len(rates))
	for i := range rates {
		out = append(out, toAdminRate(&rates[i]))
	}
	return out, nil
}

func (s *Service) CreateRate(ctx context.Context, in CreateRateRequest) (*AdminRateResponse, error) {
	r := &models.ImportRate{
		Name: strings.TrimSpace(in.Name), AvgWeightLb: round2(in.AvgWeightLb),
		FreightCOP: in.FreightCOP, HandlingCOP: in.HandlingCOP, InsuranceCOP: in.InsuranceCOP,
		NationalDeliveryCOP: in.NationalDeliveryCOP, MarginCOP: in.MarginCOP,
		MaxDeclaredUSDCents: in.MaxDeclaredUSDCents, RequiresManualQuote: in.RequiresManualQuote,
		Notes: strings.TrimSpace(in.Notes), IsActive: in.IsActive == nil || *in.IsActive, SortOrder: in.SortOrder,
	}
	recalc(r)
	if err := s.repo.CreateRate(ctx, r); err != nil {
		if errors.Is(err, errRateExists) {
			return nil, rateExists()
		}
		return nil, apperr.Internal(err)
	}
	out := toAdminRate(r)
	return &out, nil
}

func (s *Service) UpdateRate(ctx context.Context, id uuid.UUID, in UpdateRateRequest) (*AdminRateResponse, error) {
	r, err := s.repo.GetRate(ctx, id)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return nil, rateNotFound()
		}
		return nil, apperr.Internal(err)
	}
	if in.Name != nil {
		r.Name = strings.TrimSpace(*in.Name)
	}
	if in.AvgWeightLb != nil {
		r.AvgWeightLb = round2(*in.AvgWeightLb)
	}
	if in.FreightCOP != nil {
		r.FreightCOP = *in.FreightCOP
	}
	if in.HandlingCOP != nil {
		r.HandlingCOP = *in.HandlingCOP
	}
	if in.InsuranceCOP != nil {
		r.InsuranceCOP = *in.InsuranceCOP
	}
	if in.NationalDeliveryCOP != nil {
		r.NationalDeliveryCOP = *in.NationalDeliveryCOP
	}
	if in.MarginCOP != nil {
		r.MarginCOP = *in.MarginCOP
	}
	if in.MaxDeclaredUSDCents != nil {
		r.MaxDeclaredUSDCents = *in.MaxDeclaredUSDCents
	}
	if in.RequiresManualQuote != nil {
		r.RequiresManualQuote = *in.RequiresManualQuote
	}
	if in.Notes != nil {
		r.Notes = strings.TrimSpace(*in.Notes)
	}
	if in.IsActive != nil {
		r.IsActive = *in.IsActive
	}
	if in.SortOrder != nil {
		r.SortOrder = *in.SortOrder
	}
	recalc(r)
	r.UpdatedAt = time.Now().UTC()
	if err := s.repo.SaveRate(ctx, r); err != nil {
		if errors.Is(err, errRateExists) {
			return nil, rateExists()
		}
		return nil, apperr.Internal(err)
	}
	out := toAdminRate(r)
	return &out, nil
}

func toAdminRate(r *models.ImportRate) AdminRateResponse {
	return AdminRateResponse{
		ID: r.ID, Name: r.Name, AvgWeightLb: r.AvgWeightLb, FreightCOP: r.FreightCOP, HandlingCOP: r.HandlingCOP,
		InsuranceCOP: r.InsuranceCOP, NationalDeliveryCOP: r.NationalDeliveryCOP, MarginCOP: r.MarginCOP,
		FlatFeeCOP: r.FlatFeeCOP, MaxDeclaredUSDCents: r.MaxDeclaredUSDCents,
		RequiresManualQuote: r.RequiresManualQuote, Notes: r.Notes, IsActive: r.IsActive,
		SortOrder: r.SortOrder, UpdatedAt: r.UpdatedAt,
	}
}
