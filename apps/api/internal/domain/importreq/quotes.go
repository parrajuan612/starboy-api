package importreq

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

func notFoundImport() *apperr.Error {
	return apperr.New(apperr.KindNotFound, "IMPORT_NOT_FOUND", "No encontramos ese encargo.")
}

// CreateQuote emite la cotización formal (SSD §10.2/§10.5). Todo el cálculo se hace en el servidor
// con settings vigentes; el resultado se congela en la cotización (params_used) y vence a las
// quote_validity_hours (48 h). Una versión nueva invalida las anteriores.
func (s *Service) CreateQuote(ctx context.Context, requestID, adminID uuid.UUID, in CreateQuoteRequest) (*RequestResponse, error) {
	p, err := s.params.Params(ctx)
	if err != nil {
		return nil, err
	}
	if in.DepositPercent != nil {
		p.DefaultDepositPercent = int64(*in.DepositPercent)
	}
	if p.DefaultDepositPercent < 1 {
		return nil, fieldErr("deposit_percent", "El anticipo debe ser de al menos 1 %.")
	}
	if in.BalanceCODAllowed && p.DefaultDepositPercent < 50 {
		return nil, fieldErr("balance_cod_allowed", "El saldo contra entrega exige un anticipo de al menos 50 %.")
	}

	err = s.repo.CreateQuote(ctx, requestID, func(r *models.ImportRequest, items []models.ImportRequestItem, version int) (*models.ImportQuote, *models.ImportStatusHistory, error) {
		if !models.CanTransition(r.Status, models.ImportQuoted) {
			return nil, nil, apperr.New(apperr.KindConflict, "INVALID_STATUS_TRANSITION",
				fmt.Sprintf("No se puede cotizar un encargo en estado «%s».", statusLabel(r.Status))).
				WithDetails(map[string]any{"from": r.Status, "to": models.ImportQuoted, "allowed": models.AllowedTransitions(r.Status)})
		}

		// Cada ítem necesita categoría y precio para poder cotizarse.
		missing := map[string]string{}
		lines := make([]Line, 0, len(items))
		snapshot := make([]map[string]any, 0, len(items))
		var productUSDCents int64
		for i, it := range items {
			switch {
			case it.ImportRate == nil:
				missing[fmt.Sprintf("items[%d].import_rate_id", i)] = "Falta la categoría de encargo."
			case it.DeclaredPriceUSDCents <= 0:
				missing[fmt.Sprintf("items[%d].declared_price_usd_cents", i)] = "Falta el precio declarado."
			default:
				lines = append(lines, Line{PriceUSDCents: it.DeclaredPriceUSDCents, Quantity: it.Quantity, Rate: *it.ImportRate})
				productUSDCents += it.DeclaredPriceUSDCents * int64(it.Quantity)
				snapshot = append(snapshot, map[string]any{
					"description": it.Description, "quantity": it.Quantity, "price_usd_cents": it.DeclaredPriceUSDCents,
					"rate": it.ImportRate.Name, "rate_flat_fee_cop": it.ImportRate.FlatFeeCOP,
				})
			}
		}
		if len(missing) > 0 {
			return nil, nil, apperr.New(apperr.KindValidation, "QUOTE_INCOMPLETE",
				"Faltan datos en los ítems del encargo para poder cotizar.").WithDetails(missing)
		}

		opts := Options{LogisticsCOP: in.LogisticsCOPOverride}
		if res := Calculate(lines, p); res.ManualQuote {
			if in.LogisticsCOPOverride == nil {
				return nil, nil, fieldErr("logistics_cop_override", "Este encargo es de cotización personalizada: indica la logística en COP.")
			}
			opts.AllowManual = true
		}
		b := CalculateWithOptions(lines, p, opts).Breakdown

		params, _ := json.Marshal(map[string]any{
			"params": p, "items": snapshot, "logistics_cop_override": in.LogisticsCOPOverride,
		})
		now := time.Now().UTC()
		quote := &models.ImportQuote{
			Version: version, ProductCostUSDCents: productUSDCents, ExchangeRateCOP: p.ExchangeRateCOP,
			ProductCOP: b.ProductCOP, LogisticsCOP: b.LogisticsCOP, ServiceFeeCOP: b.ServiceFeeCOP,
			TaxesCOP: b.TaxesCOP, TotalCOP: b.TotalCOP, TaxesApplied: b.TaxesApplied,
			DepositPercent: int(p.DefaultDepositPercent), DepositCOP: b.DepositCOP, BalanceCOP: b.BalanceCOP,
			BalanceCODAllowed: in.BalanceCODAllowed, ParamsUsed: models.JSONB(params),
			ValidUntil: now.Add(time.Duration(p.QuoteValidityHours) * time.Hour), Status: models.QuoteSent,
			NotesCustomer: in.NotesCustomer, CreatedByID: &adminID,
		}
		r.Status = models.ImportQuoted // saveStatus lo persiste junto con la entrada de historial
		hist := &models.ImportStatusHistory{
			Status: models.ImportQuoted, NotifyCustomer: true, ChangedByID: &adminID,
			Note: fmt.Sprintf("Tu cotización está lista (versión %d). Tienes %d horas para aceptarla.", version, p.QuoteValidityHours),
		}
		return quote, hist, nil
	})
	if err != nil {
		if _, ok := apperr.As(err); ok {
			return nil, err
		}
		if errors.Is(err, errNotFound) {
			return nil, notFoundImport()
		}
		return nil, apperr.Internal(err)
	}
	return s.Get(ctx, requestID, true)
}

// AcceptQuote: el cliente acepta su cotización. Valida dueño, estado, que sea la versión vigente
// y que no haya vencido (now < valid_until), todo dentro de la transacción (§10.5).
func (s *Service) AcceptQuote(ctx context.Context, userID, requestID, quoteID uuid.UUID) (*RequestResponse, error) {
	err := s.repo.AcceptQuote(ctx, requestID, quoteID, func(r *models.ImportRequest, q *models.ImportQuote) (*models.ImportStatusHistory, error) {
		if r.UserID == nil || *r.UserID != userID {
			return nil, notFoundImport() // no se revela si el encargo existe
		}
		if !models.CanTransition(r.Status, models.ImportAccepted) {
			return nil, apperr.New(apperr.KindConflict, "INVALID_STATUS_TRANSITION",
				fmt.Sprintf("No puedes aceptar la cotización: tu encargo está «%s».", statusLabel(r.Status)))
		}
		if q.Status != models.QuoteSent {
			return nil, apperr.New(apperr.KindConflict, "QUOTE_NOT_AVAILABLE",
				"Esta cotización ya no está disponible. Revisa la más reciente.")
		}
		if q.IsExpired(time.Now()) {
			return nil, apperr.New(apperr.KindConflict, "QUOTE_EXPIRED",
				"Esta cotización venció. Pide una nueva y te respondemos pronto.")
		}
		q.Status = models.QuoteAccepted
		r.Status = models.ImportAccepted
		return &models.ImportStatusHistory{
			Status: models.ImportAccepted, NotifyCustomer: true, ChangedByID: &userID,
			Note: "Aceptaste la cotización. Para continuar, paga el anticipo.",
		}, nil
	})
	if err != nil {
		if _, ok := apperr.As(err); ok {
			return nil, err
		}
		if errors.Is(err, errNotFound) {
			return nil, notFoundImport()
		}
		return nil, apperr.Internal(err)
	}
	return s.Get(ctx, requestID, false)
}
