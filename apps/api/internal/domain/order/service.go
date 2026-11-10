package order

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/domain/inventory"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

// UserReader obtiene los datos del comprador.
type UserReader interface {
	FindUser(ctx context.Context, id uuid.UUID) (*models.User, error)
}

// Service contiene las reglas de las órdenes.
type Service struct {
	repo  Repository
	users UserReader
	now   func() time.Time
}

// NewService crea el servicio.
func NewService(repo Repository, users UserReader) *Service {
	return &Service{repo: repo, users: users, now: time.Now}
}

func fieldErr(field, msg string) *apperr.Error {
	return apperr.New(apperr.KindValidation, "VALIDATION_ERROR", "Revisa los datos que enviaste.").
		WithDetails(map[string]string{field: msg})
}

// Create registra una compra directa: valida el catálogo, fija precios con los valores vigentes,
// reserva el stock y crea la orden en PENDING_PAYMENT, todo en una transacción.
//
// idemKey (opcional) hace el reintento seguro: con la misma llave se devuelve la orden ya creada (created=false).
func (s *Service) Create(ctx context.Context, userID uuid.UUID, in CreateRequest, idemKey string) (resp *OrderResponse, created bool, err error) {
	doc := strings.ToUpper(strings.TrimSpace(in.DocumentID))
	if !documentRe.MatchString(doc) {
		return nil, false, fieldErr("document_id", "Escribe tu cédula o documento sin puntos ni espacios (5 a 20 letras o números).")
	}
	user, err := s.users.FindUser(ctx, userID)
	if err != nil {
		return nil, false, apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar.")
	}
	if !user.IsActive {
		return nil, false, apperr.New(apperr.KindForbidden, "ACCOUNT_DISABLED", "Tu cuenta está desactivada. Escríbenos y te ayudamos.")
	}

	// Una variante repetida en el carrito se suma en una sola línea.
	qty := map[uuid.UUID]int{}
	order := []uuid.UUID{}
	firstIdx := map[uuid.UUID]int{}
	for i, it := range in.Items {
		if _, seen := qty[it.VariantID]; !seen {
			order = append(order, it.VariantID)
			firstIdx[it.VariantID] = i
		}
		qty[it.VariantID] += it.Quantity
	}

	addr := in.ShippingAddress
	addrJSON, _ := json.Marshal(map[string]string{
		"recipient_name": strings.TrimSpace(addr.RecipientName), "phone": strings.TrimSpace(addr.Phone),
		"department": strings.TrimSpace(addr.Department), "city": strings.TrimSpace(addr.City),
		"dane_code": addr.DaneCode, "line1": strings.TrimSpace(addr.Line1),
		"line2": strings.TrimSpace(addr.Line2), "notes": strings.TrimSpace(addr.Notes),
	})

	var made *models.Order
	err = s.repo.CreateOrder(ctx, order, Idempotency{UserID: userID, Key: idemKey}, func(vs map[uuid.UUID]PricedVariant) (*models.Order, []inventory.Line, error) {
		now := s.now().UTC()
		o := &models.Order{
			UserID: &userID, Status: models.OrderPendingPayment,
			CustomerName: user.FullName, CustomerEmail: user.Email, CustomerPhone: strings.TrimSpace(addr.Phone),
			CustomerDocument: doc,
			ShippingAddress:  models.JSONB(addrJSON), Notes: strings.TrimSpace(in.Notes),
			ReservedUntil: ptr(now.Add(ReservationTTL * time.Second)),
		}
		if idemKey != "" {
			o.IdempotencyKey = &idemKey
		}
		lines := make([]inventory.Line, 0, len(order))
		unavailable := map[string]string{}
		for _, id := range order {
			pv, ok := vs[id]
			if !ok {
				unavailable[fmt.Sprintf("items[%d].variant_id", firstIdx[id])] = "Este producto ya no está disponible."
				continue
			}
			price := pv.Variant.EffectivePriceCOP(pv.Product)
			o.Items = append(o.Items, models.OrderItem{
				VariantID: id, ProductName: pv.Product.Name, SKU: pv.Variant.SKU, Size: pv.Variant.Size,
				Quantity: qty[id], UnitPriceCOP: price,
			})
			o.SubtotalCOP += price * int64(qty[id])
			lines = append(lines, inventory.Line{VariantID: id, Quantity: qty[id]})
		}
		if len(unavailable) > 0 {
			return nil, nil, apperr.New(apperr.KindValidation, "VARIANT_UNAVAILABLE",
				"Algunos productos de tu carrito ya no están disponibles.").WithDetails(unavailable)
		}
		// Envío y descuentos: sin tarifas por zona ni cupones todavía (SSD §10.7), quedan en 0.
		o.TotalCOP = o.SubtotalCOP - o.DiscountCOP + o.ShippingCOP
		o.History = []models.OrderStatusHistory{{
			Status: models.OrderPendingPayment, ChangedByID: &userID,
			Note: "Recibimos tu orden. Tienes 30 minutos para pagarla; mientras tanto reservamos tus productos.",
		}}
		made = o
		return o, lines, nil
	})
	var existing *ExistingOrderError
	switch {
	case errors.As(err, &existing):
		resp, err = s.Get(ctx, existing.OrderID, userID, false)
		return resp, false, err
	case idemKey != "" && errors.Is(err, gorm.ErrDuplicatedKey):
		// Carrera extrema: otra petición con la misma llave confirmó justo antes que esta.
		if o, ferr := s.repo.FindByKey(ctx, userID, idemKey); ferr == nil {
			resp, err = s.Get(ctx, o.ID, userID, false)
			return resp, false, err
		}
	}
	if err != nil {
		return nil, false, s.mapCreateErr(err, order, firstIdx)
	}
	resp, err = s.Get(ctx, made.ID, userID, false)
	return resp, true, err
}

// documentRe: cédula, NIT, cédula de extranjería o pasaporte, sin puntos ni espacios.
var documentRe = regexp.MustCompile(`^[A-Z0-9]{5,20}$`)

func (s *Service) mapCreateErr(err error, order []uuid.UUID, firstIdx map[uuid.UUID]int) error {
	if _, ok := apperr.As(err); ok {
		return err
	}
	var short *inventory.ShortageError
	if errors.As(err, &short) {
		details := map[string]any{}
		for _, sh := range short.Shortages {
			details[fmt.Sprintf("items[%d]", firstIdx[sh.VariantID])] = map[string]any{
				"variant_id": sh.VariantID, "requested": sh.Requested, "available": sh.Available,
			}
		}
		return apperr.New(apperr.KindConflict, "INSUFFICIENT_STOCK",
			"No tenemos stock suficiente de algunos productos. Ajusta las cantidades e inténtalo de nuevo.").WithDetails(details)
	}
	return apperr.Internal(err)
}

// Get devuelve una orden al dueño (o a un admin).
func (s *Service) Get(ctx context.Context, id, userID uuid.UUID, isAdmin bool) (*OrderResponse, error) {
	o, err := s.repo.Get(ctx, id)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return nil, apperr.New(apperr.KindNotFound, "ORDER_NOT_FOUND", "No encontramos esa orden.")
		}
		return nil, apperr.Internal(err)
	}
	if !isAdmin && (o.UserID == nil || *o.UserID != userID) {
		return nil, apperr.New(apperr.KindNotFound, "ORDER_NOT_FOUND", "No encontramos esa orden.") // no se revela si existe
	}
	r := toResponse(o)
	return &r, nil
}

// ListMine devuelve el historial de compras del cliente.
func (s *Service) ListMine(ctx context.Context, userID uuid.UUID, q ListQuery) ([]OrderResponse, response.Meta, error) {
	page, limit := q.Page, q.Limit
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = defaultLimit
	}
	limit = min(limit, maxLimit)
	items, total, err := s.repo.ListByUser(ctx, userID, q.Status, (page-1)*limit, limit)
	if err != nil {
		return nil, response.Meta{}, apperr.Internal(err)
	}
	out := make([]OrderResponse, 0, len(items))
	for i := range items {
		out = append(out, toResponse(&items[i]))
	}
	return out, response.NewMeta(page, limit, total), nil
}

// ExpireStale libera las reservas vencidas (job periódico, SSD §10.1).
func (s *Service) ExpireStale(ctx context.Context) (int, error) {
	n, err := s.repo.ExpireStale(ctx, s.now())
	if err != nil {
		return n, err
	}
	if n > 0 {
		slog.Info("órdenes con reserva vencida canceladas", "cantidad", n)
	}
	return n, nil
}

func ptr[T any](v T) *T { return &v }

func toResponse(o *models.Order) OrderResponse {
	r := OrderResponse{
		ID: o.ID, Code: o.Code, Status: o.Status, StatusLabel: statusLabels[o.Status],
		SubtotalCOP: o.SubtotalCOP, DiscountCOP: o.DiscountCOP, ShippingCOP: o.ShippingCOP, TotalCOP: o.TotalCOP,
		ShippingAddress: o.ShippingAddress, Notes: o.Notes, ReservedUntil: o.ReservedUntil,
		CarrierName: o.Carrier, TrackingNumber: o.TrackingNumber, ItemCount: len(o.Items),
		CreatedAt: o.CreatedAt, UpdatedAt: o.UpdatedAt,
		Items: make([]ItemResponse, 0, len(o.Items)),
	}
	for _, it := range o.Items {
		r.Items = append(r.Items, ItemResponse{VariantID: it.VariantID, ProductName: it.ProductName, SKU: it.SKU,
			Size: it.Size, Quantity: it.Quantity, UnitPriceCOP: it.UnitPriceCOP,
			LineTotalCOP: it.UnitPriceCOP * int64(it.Quantity)})
	}
	for _, h := range o.History {
		r.History = append(r.History, HistoryResponse{Status: h.Status, Label: statusLabels[h.Status], Note: h.Note, CreatedAt: h.CreatedAt})
	}
	return r
}
