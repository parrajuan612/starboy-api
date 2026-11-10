package importreq

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/domain/settings"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

// ParamsProvider entrega los parámetros de negocio vigentes (settings).
type ParamsProvider interface {
	Params(ctx context.Context) (settings.Params, error)
}

// Service contiene las reglas de los encargos.
type Service struct {
	repo   Repository
	params ParamsProvider
}

// NewService crea el servicio.
func NewService(repo Repository, params ParamsProvider) *Service {
	return &Service{repo: repo, params: params}
}

func fieldErr(field, msg string) *apperr.Error {
	return apperr.New(apperr.KindValidation, "VALIDATION_ERROR", "Revisa los datos que enviaste.").
		WithDetails(map[string]string{field: msg})
}

func pageArgs(page, limit int) (int, int) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = defaultLimit
	}
	return page, min(limit, maxLimit)
}

// ======================= Cotizador =======================

// ListRates devuelve las categorías de encargo con la tarifa visible para el cliente.
func (s *Service) ListRates(ctx context.Context) ([]RateResponse, error) {
	rates, err := s.repo.ListActiveRates(ctx)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	out := make([]RateResponse, 0, len(rates))
	for _, r := range rates {
		out = append(out, RateResponse{ID: r.ID, Name: r.Name, FlatFeeCOP: r.FlatFeeCOP,
			RequiresManualQuote: r.RequiresManualQuote, Notes: r.Notes})
	}
	return out, nil
}

// Quote calcula el estimado en tiempo real con los parámetros vigentes de settings.
// Es un estimado: el valor final lo fija el admin al emitir la cotización formal.
func (s *Service) Quote(ctx context.Context, in QuoteRequest) (*QuoteResponse, error) {
	p, err := s.params.Params(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, 0, len(in.Items))
	for _, it := range in.Items {
		ids = append(ids, it.ImportRateID)
	}
	rates, err := s.repo.RatesByIDs(ctx, ids)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	byID := make(map[uuid.UUID]models.ImportRate, len(rates))
	for _, r := range rates {
		byID[r.ID] = r
	}
	lines := make([]Line, 0, len(in.Items))
	for i, it := range in.Items {
		rate, ok := byID[it.ImportRateID]
		if !ok {
			return nil, fieldErr(fmt.Sprintf("items[%d].import_rate_id", i), "Esa categoría de encargo no existe o no está disponible.")
		}
		lines = append(lines, Line{PriceUSDCents: it.PriceUSDCents, USShippingUSDCents: it.USShippingUSDCents,
			Quantity: it.Quantity, Rate: rate})
	}

	res := Calculate(lines, p)
	out := &QuoteResponse{
		IsEstimate:            true,
		ExchangeRateCOP:       p.ExchangeRateCOP,
		TaxExemptThresholdUSD: p.TaxExemptThresholdUSD,
		RequiresManualQuote:   res.ManualQuote,
	}
	if res.ManualQuote {
		out.Message = "Cotización personalizada: este pedido necesita revisión. Solicítala y te respondemos con el valor exacto."
		return out, nil
	}
	b := res.Breakdown
	out.FOBUSDCents = b.FOBUSDCents
	out.TaxesApplied = b.TaxesApplied
	out.Breakdown = &QuoteBreakdown{
		ProductCOP: b.ProductCOP, LogisticsCOP: b.LogisticsCOP, ServiceFeeCOP: b.ServiceFeeCOP,
		TaxesCOP: b.TaxesCOP, TotalCOP: b.TotalCOP,
		DepositPercent: b.DepositPct, DepositCOP: b.DepositCOP, BalanceCOP: b.BalanceCOP,
	}
	return out, nil
}

// ======================= Cliente =======================

// Create registra la solicitud formal: estado REQUESTED, código IMP-xxxxxx e historial inicial.
func (s *Service) Create(ctx context.Context, userID uuid.UUID, in CreateRequest) (*RequestResponse, error) {
	user, err := s.repo.FindUser(ctx, userID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return nil, apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar.")
		}
		return nil, apperr.Internal(err)
	}
	if !user.IsActive {
		return nil, apperr.New(apperr.KindForbidden, "ACCOUNT_DISABLED", "Tu cuenta está desactivada. Escríbenos y te ayudamos.")
	}

	// Los encargos se importan a nombre del cliente: la aduana exige su cédula (SSD §10.4).
	var setDoc *string
	doc := strings.TrimSpace(user.DocumentID)
	if d := strings.TrimSpace(in.DocumentID); d != "" && d != doc {
		doc, setDoc = d, &d
	}
	if doc == "" {
		return nil, fieldErr("document_id", "Necesitamos tu cédula para importar a tu nombre. Escríbela para continuar.")
	}

	rateIDs := make([]uuid.UUID, 0, len(in.Items))
	for _, it := range in.Items {
		if it.ImportRateID != nil {
			rateIDs = append(rateIDs, *it.ImportRateID)
		}
	}
	valid := map[uuid.UUID]bool{}
	if len(rateIDs) > 0 {
		rates, err := s.repo.RatesByIDs(ctx, rateIDs)
		if err != nil {
			return nil, apperr.Internal(err)
		}
		for _, r := range rates {
			valid[r.ID] = true
		}
	}

	items := make([]models.ImportRequestItem, 0, len(in.Items))
	for i, it := range in.Items {
		if aerr := checkHTTPS(fmt.Sprintf("items[%d].product_url", i), it.ProductURL); aerr != nil {
			return nil, aerr
		}
		if aerr := checkHTTPS(fmt.Sprintf("items[%d].screenshot_url", i), it.ScreenshotURL); aerr != nil {
			return nil, aerr
		}
		if it.ImportRateID != nil && !valid[*it.ImportRateID] {
			return nil, fieldErr(fmt.Sprintf("items[%d].import_rate_id", i), "Esa categoría de encargo no existe o no está disponible.")
		}
		items = append(items, models.ImportRequestItem{
			ProductURL: it.ProductURL, StoreName: strings.TrimSpace(it.StoreName),
			Description: strings.TrimSpace(it.Description), Size: strings.TrimSpace(it.Size),
			Color: strings.TrimSpace(it.Color), Quantity: it.Quantity,
			DeclaredPriceUSDCents: it.DeclaredPriceUSDCents, ScreenshotURL: it.ScreenshotURL,
			ImportRateID: it.ImportRateID,
		})
	}

	req := &models.ImportRequest{
		UserID: &userID, Type: models.ImportCustomerOrder, Status: models.ImportRequested,
		CustomerNotes: strings.TrimSpace(in.CustomerNotes), Items: items,
		History: []models.ImportStatusHistory{{
			Status: models.ImportRequested, Note: "Recibimos tu solicitud.",
			NotifyCustomer: true, ChangedByID: &userID,
		}},
	}
	if err := s.repo.CreateRequest(ctx, req, setDoc); err != nil {
		return nil, apperr.Internal(err)
	}
	return s.Get(ctx, req.ID, false)
}

// ListMine devuelve los encargos del cliente con su historial de estados.
func (s *Service) ListMine(ctx context.Context, userID uuid.UUID, q ListQuery) ([]RequestResponse, response.Meta, error) {
	page, limit := pageArgs(q.Page, q.Limit)
	items, total, err := s.repo.List(ctx, ListFilter{
		UserID: &userID, Status: q.Status, Offset: (page - 1) * limit, Limit: limit, WithHistory: true,
	})
	if err != nil {
		return nil, response.Meta{}, apperr.Internal(err)
	}
	out := make([]RequestResponse, 0, len(items))
	for i := range items {
		out = append(out, toResponse(&items[i], false, true))
	}
	return out, response.NewMeta(page, limit, total), nil
}

// ======================= Administración =======================

// ListAll es la bandeja del admin: todas las solicitudes, filtrables por estado y código.
func (s *Service) ListAll(ctx context.Context, q ListQuery) ([]RequestResponse, response.Meta, error) {
	page, limit := pageArgs(q.Page, q.Limit)
	items, total, err := s.repo.List(ctx, ListFilter{
		Status: q.Status, CodeContains: strings.TrimSpace(q.Q), Offset: (page - 1) * limit, Limit: limit,
	})
	if err != nil {
		return nil, response.Meta{}, apperr.Internal(err)
	}
	out := make([]RequestResponse, 0, len(items))
	for i := range items {
		out = append(out, toResponse(&items[i], true, false))
	}
	return out, response.NewMeta(page, limit, total), nil
}

// Get devuelve el detalle completo (admin: con datos del cliente).
func (s *Service) Get(ctx context.Context, id uuid.UUID, admin bool) (*RequestResponse, error) {
	r, err := s.repo.Get(ctx, id)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return nil, apperr.New(apperr.KindNotFound, "IMPORT_NOT_FOUND", "No encontramos ese encargo.")
		}
		return nil, apperr.Internal(err)
	}
	out := toResponse(r, admin, true)
	return &out, nil
}

// ChangeStatus valida la transición contra la máquina de estados (§10.3) y, en una sola
// transacción, actualiza el encargo y escribe la entrada de import_status_history.
func (s *Service) ChangeStatus(ctx context.Context, id, adminID uuid.UUID, in ChangeStatusRequest) (*RequestResponse, error) {
	to := models.ImportStatus(in.Status)
	// ACCEPTED y PAID mueven dinero: solo los producen la aceptación del cliente y la confirmación
	// del pago. Permitirlos a mano saltaría el cobro del anticipo.
	if to == models.ImportAccepted || to == models.ImportPaid {
		return nil, apperr.New(apperr.KindConflict, "STATUS_MANAGED_BY_FLOW",
			fmt.Sprintf("El estado «%s» lo asigna el sistema: «Aceptada» cuando el cliente acepta la cotización y «Anticipo pagado» cuando se confirma el pago.", statusLabel(to))).
			WithDetails(map[string]any{"status": to})
	}
	err := s.repo.ChangeStatus(ctx, id, func(r *models.ImportRequest) (*models.ImportStatusHistory, error) {
		if !models.CanTransition(r.Status, to) {
			allowed := models.AllowedTransitions(r.Status)
			return nil, apperr.New(apperr.KindConflict, "INVALID_STATUS_TRANSITION",
				fmt.Sprintf("No se puede pasar un encargo de «%s» a «%s».", statusLabel(r.Status), statusLabel(to))).
				WithDetails(map[string]any{"from": r.Status, "to": to, "allowed": allowed})
		}
		r.Status = to
		if in.CarrierUSA != nil {
			r.CarrierUSA = strings.TrimSpace(*in.CarrierUSA)
		}
		if in.TrackingUSA != nil {
			r.TrackingUSA = strings.TrimSpace(*in.TrackingUSA)
		}
		if in.TrackingCO != nil {
			r.TrackingCO = strings.TrimSpace(*in.TrackingCO)
		}
		if in.WeightLb != nil {
			r.WeightLb = math.Round(*in.WeightLb*100) / 100 // numeric(8,2)
		}
		if in.ETA != nil {
			eta := in.ETA.UTC()
			r.ETA = &eta
		}
		return &models.ImportStatusHistory{
			Status: to, Note: strings.TrimSpace(in.Note),
			NotifyCustomer: in.NotifyCustomer == nil || *in.NotifyCustomer,
			ChangedByID:    &adminID,
		}, nil
	})
	if err != nil {
		if _, ok := apperr.As(err); ok {
			return nil, err
		}
		if errors.Is(err, errNotFound) {
			return nil, apperr.New(apperr.KindNotFound, "IMPORT_NOT_FOUND", "No encontramos ese encargo.")
		}
		return nil, apperr.Internal(err)
	}
	return s.Get(ctx, id, true)
}

// ======================= Mapeos =======================

func checkHTTPS(field, raw string) *apperr.Error {
	if raw == "" {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return fieldErr(field, "La URL debe empezar por https://")
	}
	return nil
}

func toResponse(r *models.ImportRequest, admin, detail bool) RequestResponse {
	out := RequestResponse{
		ID: r.ID, Code: r.Code, Type: r.Type, Status: r.Status, StatusLabel: statusLabel(r.Status),
		CustomerNotes: r.CustomerNotes, CarrierUSA: r.CarrierUSA, TrackingUSA: r.TrackingUSA,
		TrackingCO: r.TrackingCO, WeightLb: r.WeightLb, ETA: r.ETA, ItemCount: len(r.Items),
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
	if admin && r.User != nil {
		out.Customer = &CustomerRef{ID: r.User.ID, FullName: r.User.FullName, Email: r.User.Email,
			Phone: r.User.Phone, DocumentID: r.User.DocumentID}
	}
	if admin {
		out.AllowedNext = []models.ImportStatus{}
		for _, to := range models.AllowedTransitions(r.Status) {
			if to != models.ImportAccepted && to != models.ImportPaid && to != models.ImportQuoted {
				out.AllowedNext = append(out.AllowedNext, to)
			}
		}
	}
	out.Items = make([]ItemResponse, 0, len(r.Items))
	for _, it := range r.Items {
		ir := ItemResponse{ID: it.ID, ProductURL: it.ProductURL, StoreName: it.StoreName, Description: it.Description,
			Size: it.Size, Color: it.Color, Quantity: it.Quantity,
			DeclaredPriceUSDCents: it.DeclaredPriceUSDCents, ScreenshotURL: it.ScreenshotURL}
		if it.ImportRate != nil {
			ir.RateName = it.ImportRate.Name
		}
		out.Items = append(out.Items, ir)
	}
	if !detail && admin { // la bandeja no necesita el detalle de cada ítem
		out.Items = nil
	}
	if len(r.Quotes) > 0 { // el repositorio las trae de la versión más nueva a la más vieja
		out.Quote = toQuoteSummary(&r.Quotes[0])
	}
	out.History = make([]HistoryResponse, 0, len(r.History))
	for _, h := range r.History {
		out.History = append(out.History, HistoryResponse{Status: h.Status, Label: statusLabel(h.Status),
			Note: h.Note, NotifyCustomer: h.NotifyCustomer, CreatedAt: h.CreatedAt})
	}
	return out
}

func toQuoteSummary(q *models.ImportQuote) *QuoteSummary {
	return &QuoteSummary{
		ID: q.ID, Version: q.Version, Status: q.Status,
		IsExpired:  q.Status == models.QuoteExpired || (q.Status == models.QuoteSent && q.IsExpired(time.Now())),
		ProductCOP: q.ProductCOP, LogisticsCOP: q.LogisticsCOP, ServiceFeeCOP: q.ServiceFeeCOP,
		TaxesCOP: q.TaxesCOP, TotalCOP: q.TotalCOP, TaxesApplied: q.TaxesApplied,
		DepositPercent: q.DepositPercent, DepositCOP: q.DepositCOP, BalanceCOP: q.BalanceCOP,
		BalanceCODAllowed: q.BalanceCODAllowed, ValidUntil: q.ValidUntil, NotesCustomer: q.NotesCustomer,
	}
}
