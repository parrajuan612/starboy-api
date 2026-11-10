package payment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
	"github.com/juancamiloparra/starboy-api/internal/platform/payments"
)

// Service contiene las reglas de cobro. providers solo incluye las pasarelas habilitadas.
type Service struct {
	repo      Repository
	providers map[models.PaymentProvider]payments.Provider
}

// NewService crea el servicio con las pasarelas disponibles.
func NewService(repo Repository, providers ...payments.Provider) *Service {
	m := make(map[models.PaymentProvider]payments.Provider, len(providers))
	for _, p := range providers {
		m[p.Name()] = p
	}
	return &Service{repo: repo, providers: m}
}

// Provider devuelve la pasarela habilitada con ese nombre.
func (s *Service) Provider(name models.PaymentProvider) (payments.Provider, bool) {
	p, ok := s.providers[name]
	return p, ok
}

func conflict(code, msg string) *apperr.Error { return apperr.New(apperr.KindConflict, code, msg) }

func notFoundImport() *apperr.Error {
	return apperr.New(apperr.KindNotFound, "IMPORT_NOT_FOUND", "No encontramos ese encargo.")
}

func notFoundPayment() *apperr.Error {
	return apperr.New(apperr.KindNotFound, "PAYMENT_NOT_FOUND", "No encontramos ese pago.")
}

func notFoundOrder() *apperr.Error {
	return apperr.New(apperr.KindNotFound, "ORDER_NOT_FOUND", "No encontramos esa orden.")
}

// Checkout abre un cobro: el total de una orden de la tienda o el anticipo de un encargo.
// El monto lo fija el servidor. Es idempotente: si ya hay un cobro pendiente, devuelve ese mismo.
func (s *Service) Checkout(ctx context.Context, userID uuid.UUID, in CheckoutRequest) (*PaymentResponse, error) {
	if (in.OrderID == nil) == (in.ImportRequestID == nil) {
		return nil, apperr.New(apperr.KindValidation, "VALIDATION_ERROR", "Revisa los datos que enviaste.").
			WithDetails(map[string]string{"order_id": "Envía order_id o import_request_id (solo uno)."})
	}
	name := models.PaymentProvider(in.Provider)
	if name == "" {
		name = models.ProviderSandbox
	}
	prov, ok := s.providers[name]
	if !ok {
		return nil, apperr.New(apperr.KindValidation, "PROVIDER_NOT_AVAILABLE",
			"Ese método de pago no está disponible por ahora.").WithDetails(map[string]string{"provider": "No disponible."})
	}
	var (
		p   *models.Payment
		err error
	)
	if in.OrderID != nil {
		p, err = s.checkoutOrder(ctx, userID, *in.OrderID, name, prov)
	} else {
		p, err = s.checkoutImport(ctx, userID, *in.ImportRequestID, name, prov)
	}
	if err != nil {
		return nil, s.mapErr(err)
	}
	r := s.toResponse(p)
	return &r, nil
}

func (s *Service) checkoutOrder(ctx context.Context, userID, orderID uuid.UUID,
	name models.PaymentProvider, prov payments.Provider) (*models.Payment, error) {
	return s.repo.CheckoutOrder(ctx, orderID, func(oc *OrderCheckoutContext) (*models.Payment, bool, error) {
		o := oc.Order
		if o.UserID == nil || *o.UserID != userID {
			return nil, false, notFoundOrder() // no se revela si la orden existe
		}
		for i := range oc.Existing {
			if oc.Existing[i].Status == models.PaymentApproved {
				return nil, false, conflict("ALREADY_PAID", "Esta orden ya está pagada.")
			}
		}
		if o.Status != models.OrderPendingPayment {
			return nil, false, conflict("ORDER_NOT_PAYABLE", fmt.Sprintf("Esta orden ya no admite pago (estado: %s).", o.Status))
		}
		if o.ReservedUntil != nil && time.Now().After(*o.ReservedUntil) {
			return nil, false, conflict("ORDER_EXPIRED", "La reserva de tus productos venció. Crea una orden nueva para comprar.")
		}
		if o.TotalCOP <= 0 {
			return nil, false, conflict("ORDER_NOT_PAYABLE", "Esta orden no tiene un valor a pagar.")
		}
		for i := range oc.Existing {
			e := &oc.Existing[i]
			if e.Status == models.PaymentPending && e.Provider == name {
				return e, false, nil
			}
		}
		id := uuid.New()
		res, err := prov.CreateCheckout(ctx, payments.CheckoutInput{PaymentID: id, AmountCOP: o.TotalCOP, Description: "Orden " + o.Code})
		if err != nil {
			return nil, false, apperr.Internal(fmt.Errorf("crear cobro en %s: %w", name, err))
		}
		ref := res.ProviderRef
		return &models.Payment{
			Base: models.Base{ID: id}, OrderID: &o.ID, Provider: name, ProviderRef: &ref,
			Kind: models.PaymentFull, AmountCOP: o.TotalCOP, Status: models.PaymentPending,
		}, true, nil
	})
}

// checkoutImport abre el cobro del anticipo de un encargo; el monto sale de la cotización aceptada.
func (s *Service) checkoutImport(ctx context.Context, userID, importID uuid.UUID,
	name models.PaymentProvider, prov payments.Provider) (*models.Payment, error) {
	return s.repo.Checkout(ctx, importID, func(cc *CheckoutContext) (*models.Payment, bool, error) {
		imp := cc.Import
		if imp.UserID == nil || *imp.UserID != userID {
			return nil, false, notFoundImport() // no se revela si el encargo existe
		}
		for i := range cc.Existing {
			if cc.Existing[i].Kind == models.PaymentDeposit && cc.Existing[i].Status == models.PaymentApproved {
				return nil, false, conflict("ALREADY_PAID", "Ya recibimos el anticipo de este encargo.")
			}
		}
		switch imp.Status {
		case models.ImportAccepted: // único estado desde el que se cobra el anticipo
		case models.ImportRequested, models.ImportQuoted, models.ImportExpired:
			return nil, false, conflict("QUOTE_NOT_ACCEPTED", "Primero acepta la cotización de tu encargo para poder pagar el anticipo.")
		default:
			return nil, false, conflict("IMPORT_NOT_PAYABLE",
				fmt.Sprintf("Este encargo ya no admite pago de anticipo (estado: %s).", imp.Status))
		}
		if cc.Quote == nil || cc.Quote.DepositCOP <= 0 {
			return nil, false, conflict("NO_ACCEPTED_QUOTE", "No encontramos una cotización aceptada con anticipo para este encargo.")
		}
		// Un cobro pendiente del mismo tipo se reutiliza.
		for i := range cc.Existing {
			e := &cc.Existing[i]
			if e.Kind == models.PaymentDeposit && e.Status == models.PaymentPending && e.Provider == name {
				return e, false, nil
			}
		}
		id := uuid.New()
		res, err := prov.CreateCheckout(ctx, payments.CheckoutInput{
			PaymentID: id, AmountCOP: cc.Quote.DepositCOP, Description: "Anticipo encargo " + imp.Code,
		})
		if err != nil {
			return nil, false, apperr.Internal(fmt.Errorf("crear cobro en %s: %w", name, err))
		}
		ref := res.ProviderRef
		return &models.Payment{
			Base:            models.Base{ID: id},
			ImportRequestID: &imp.ID, Provider: name, ProviderRef: &ref,
			Kind: models.PaymentDeposit, AmountCOP: cc.Quote.DepositCOP, Status: models.PaymentPending,
		}, true, nil
	})
}

// ProcessEvent aplica una notificación ya autenticada de la pasarela. Es idempotente y atómica:
// pago, estado del encargo u orden, stock e historial se guardan juntos o no se guarda nada.
func (s *Service) ProcessEvent(ctx context.Context, provider models.PaymentProvider, ev *payments.Event) (*PaymentResponse, error) {
	p, err := s.repo.ApplyEvent(ctx, provider, ev.ProviderRef, func(ec *EventContext) (*Effects, error) {
		pay := ec.Payment
		if pay.Status != models.PaymentPending {
			return nil, errNoChange // evento repetido o ya resuelto: se responde 200 sin tocar nada
		}
		if ev.AmountCOP != pay.AmountCOP {
			slog.Warn("webhook con monto distinto al cobro", "payment_id", pay.ID, "esperado", pay.AmountCOP, "recibido", ev.AmountCOP)
			return nil, apperr.New(apperr.KindValidation, "AMOUNT_MISMATCH", "El monto notificado no coincide con el cobro.")
		}
		pay.RawPayload = rawPayload(ev.Raw)

		if ev.Outcome == payments.OutcomeDeclined {
			pay.Status = models.PaymentDeclined // el encargo o la orden no cambian
			return nil, nil
		}
		// Aprobado. Si el destino ya no puede avanzar, el dinero se registra en revisión manual:
		// no se inventa un estado ni se pierde el pago.
		review := func(why string, args ...any) (*Effects, error) {
			slog.Warn("pago aprobado que requiere revisión", append([]any{"payment_id", pay.ID, "motivo", why}, args...)...)
			pay.Status = models.PaymentInReview
			return nil, nil
		}

		switch {
		case ec.Import != nil:
			imp := ec.Import
			if pay.Kind != models.PaymentDeposit || ec.ApprovedExists || !models.CanTransition(imp.Status, models.ImportPaid) {
				return review("encargo no puede pasar a PAID", "estado", imp.Status, "duplicado", ec.ApprovedExists)
			}
			pay.Status = models.PaymentApproved
			imp.Status = models.ImportPaid
			return &Effects{ImportHistory: &models.ImportStatusHistory{
				Status: models.ImportPaid, NotifyCustomer: true,
				Note: fmt.Sprintf("Recibimos tu anticipo de %s. ¡Ya empezamos con tu encargo!", formatCOP(pay.AmountCOP)),
			}}, nil

		case ec.Order != nil:
			o := ec.Order
			if pay.Kind != models.PaymentFull || ec.ApprovedExists || o.Status != models.OrderPendingPayment {
				// p. ej. la reserva venció y el job ya canceló la orden: el stock pudo volver a venderse.
				return review("orden no está pendiente de pago", "estado", o.Status, "duplicado", ec.ApprovedExists)
			}
			for _, it := range ec.OrderItems { // el stock reservado debe seguir intacto
				v, ok := ec.Variants[it.VariantID]
				if !ok || v.StockReserved < it.Quantity || v.StockOnHand < it.Quantity {
					return review("stock reservado inconsistente", "variante", it.VariantID)
				}
			}
			pay.Status = models.PaymentApproved
			o.Status, o.ReservedUntil = models.OrderPaid, nil
			return &Effects{CommitStock: true, OrderHistory: &models.OrderStatusHistory{
				Status: models.OrderPaid,
				Note:   fmt.Sprintf("Recibimos tu pago de %s. ¡Gracias por tu compra!", formatCOP(pay.AmountCOP)),
			}}, nil

		default: // pago sin destino conocido: solo se registra
			pay.Status = models.PaymentApproved
			return nil, nil
		}
	})
	if err != nil {
		return nil, s.mapErr(err)
	}
	r := s.toResponse(p)
	return &r, nil
}

// Get devuelve un pago al dueño del encargo o a un admin.
func (s *Service) Get(ctx context.Context, id, userID uuid.UUID, isAdmin bool) (*PaymentResponse, error) {
	p, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, s.mapErr(err)
	}
	if !isAdmin {
		owner, err := s.repo.OwnerOf(ctx, p)
		if err != nil {
			return nil, apperr.Internal(err)
		}
		if owner == nil || *owner != userID {
			return nil, notFoundPayment()
		}
	}
	r := s.toResponse(p)
	return &r, nil
}

// Simulate resuelve un cobro de la pasarela simulada como si ella hubiera notificado.
// Usa la misma ruta que el webhook real (ProcessEvent): solo se salta la firma, porque el
// llamante ya está autenticado y es el dueño del cobro (o admin).
func (s *Service) Simulate(ctx context.Context, id, userID uuid.UUID, isAdmin bool, outcome string) (*PaymentResponse, error) {
	if _, ok := s.providers[models.ProviderSandbox]; !ok {
		return nil, apperr.New(apperr.KindNotFound, "NOT_FOUND", "No encontramos lo que buscas.")
	}
	cur, err := s.Get(ctx, id, userID, isAdmin)
	if err != nil {
		return nil, err
	}
	if cur.Provider != models.ProviderSandbox || cur.ProviderRef == "" {
		return nil, conflict("NOT_SANDBOX_PAYMENT", "Solo se pueden simular pagos de la pasarela de pruebas.")
	}
	status := "approved"
	if outcome == "declined" {
		status = "declined"
	}
	raw, _ := json.Marshal(map[string]any{"provider_ref": cur.ProviderRef, "status": status, "amount_cop": cur.AmountCOP, "simulated": true})
	ev := &payments.Event{ProviderRef: cur.ProviderRef, AmountCOP: cur.AmountCOP, Raw: raw, Outcome: payments.OutcomeApproved}
	if status == "declined" {
		ev.Outcome = payments.OutcomeDeclined
	}
	return s.ProcessEvent(ctx, models.ProviderSandbox, ev)
}

// List es el listado de administración (por ejemplo ?status=IN_REVIEW).
func (s *Service) List(ctx context.Context, q ListQuery) ([]PaymentResponse, response.Meta, error) {
	page, limit := q.Page, q.Limit
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = defaultLimit
	}
	f := ListFilter{Status: q.Status, Offset: (page - 1) * limit, Limit: min(limit, maxLimit)}
	if q.ImportRequestID != "" {
		id, _ := uuid.Parse(q.ImportRequestID) // ya validado por el binding
		f.ImportRequestID = &id
	}
	if q.OrderID != "" {
		id, _ := uuid.Parse(q.OrderID)
		f.OrderID = &id
	}
	items, total, err := s.repo.List(ctx, f)
	if err != nil {
		return nil, response.Meta{}, apperr.Internal(err)
	}
	out := make([]PaymentResponse, 0, len(items))
	for i := range items {
		out = append(out, s.toResponse(&items[i]))
	}
	return out, response.NewMeta(page, f.Limit, total), nil
}

func (s *Service) mapErr(err error) error {
	if _, ok := apperr.As(err); ok {
		return err
	}
	if errors.Is(err, errNotFound) {
		return notFoundPayment()
	}
	return apperr.Internal(err)
}

func (s *Service) toResponse(p *models.Payment) PaymentResponse {
	r := PaymentResponse{
		ID: p.ID, ImportRequestID: p.ImportRequestID, OrderID: p.OrderID, Provider: p.Provider,
		Kind: p.Kind, AmountCOP: p.AmountCOP, Status: p.Status, StatusLabel: statusLabels[p.Status],
		CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
	if p.ProviderRef != nil {
		r.ProviderRef = *p.ProviderRef
		if prov, ok := s.providers[p.Provider]; ok && p.Status == models.PaymentPending {
			r.CheckoutURL = prov.CheckoutURL(*p.ProviderRef)
		}
	}
	return r
}

// rawPayload guarda el cuerpo tal cual si es JSON; si no, lo envuelve para no perderlo.
func rawPayload(b []byte) models.JSONB {
	if json.Valid(b) {
		return models.JSONB(b)
	}
	w, _ := json.Marshal(map[string]string{"raw": string(b)})
	return models.JSONB(w)
}

// formatCOP: 403000 -> "$403.000".
func formatCOP(n int64) string {
	s := fmt.Sprint(n)
	var parts []string
	for len(s) > 3 {
		parts = append([]string{s[len(s)-3:]}, parts...)
		s = s[:len(s)-3]
	}
	return "$" + strings.Join(append([]string{s}, parts...), ".")
}
