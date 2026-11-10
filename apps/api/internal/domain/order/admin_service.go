package order

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

func notFound() *apperr.Error {
	return apperr.New(apperr.KindNotFound, "ORDER_NOT_FOUND", "No encontramos esa orden.")
}

// AdminList lista las órdenes para el panel.
func (s *Service) AdminList(ctx context.Context, q AdminListQuery) ([]AdminOrderResponse, response.Meta, error) {
	page, limit := q.Page, q.Limit
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = defaultLimit
	}
	limit = min(limit, adminMaxLimit)
	items, total, err := s.repo.ListAll(ctx, AdminFilter{Status: q.Status, Search: strings.TrimSpace(q.Q)}, (page-1)*limit, limit)
	if err != nil {
		return nil, response.Meta{}, apperr.Internal(err)
	}
	out := make([]AdminOrderResponse, 0, len(items))
	for i := range items {
		out = append(out, toAdminResponse(&items[i]))
	}
	return out, response.NewMeta(page, limit, total), nil
}

// AdminGet devuelve el detalle completo, con quién hizo cada cambio.
func (s *Service) AdminGet(ctx context.Context, id uuid.UUID) (*AdminOrderResponse, error) {
	o, err := s.repo.GetForAdmin(ctx, id)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return nil, notFound()
		}
		return nil, apperr.Internal(err)
	}
	r := toAdminResponse(o)
	return &r, nil
}

// UpdateStatus cambia el estado de una orden. La transición se valida contra el estado real de la
// fila bloqueada (no contra lo que el panel creía), así dos operadores no pueden pisarse.
func (s *Service) UpdateStatus(ctx context.Context, id, actorID uuid.UUID, in UpdateStatusRequest) (*UpdateStatusResponse, error) {
	to := models.OrderStatus(in.Status)
	note := strings.TrimSpace(in.Note)
	carrier, tracking := strings.TrimSpace(in.Carrier), strings.TrimSpace(in.TrackingNumber)

	if to == models.OrderCancelled && len([]rune(note)) < 3 {
		return nil, fieldErr("note", "Cuéntanos el motivo de la cancelación (mínimo 3 caracteres).")
	}
	if to == models.OrderShipped {
		if carrier == "" {
			return nil, fieldErr("carrier", "Indica la transportadora.")
		}
		if tracking == "" {
			return nil, fieldErr("tracking_number", "Indica el número de guía.")
		}
	} else if carrier != "" || tracking != "" {
		return nil, fieldErr("carrier", "La transportadora y la guía solo se registran al pasar a «Enviada».")
	}

	res, err := s.repo.ChangeStatus(ctx, id, actorID, func(cur *models.Order) (Change, error) {
		if !canMove(cur.Status, to) {
			return Change{}, apperr.New(apperr.KindConflict, "INVALID_TRANSITION",
				"No se puede pasar la orden de «"+statusLabels[cur.Status]+"» a «"+statusLabels[to]+"».").
				WithDetails(map[string]any{"current": cur.Status, "allowed": allowedNext(cur.Status)})
		}
		if note == "" {
			note = defaultNotes[to]
		}
		return Change{To: to, Note: note, Carrier: carrier, TrackingNumber: tracking}, nil
	})
	if err != nil {
		if _, ok := apperr.As(err); ok {
			return nil, err
		}
		if errors.Is(err, errNotFound) {
			return nil, notFound()
		}
		return nil, apperr.Internal(err)
	}
	full, err := s.AdminGet(ctx, id)
	if err != nil {
		return nil, err
	}
	return &UpdateStatusResponse{
		Order: *full, StockEffect: res.Stock,
		RefundRequired: res.Cancelled && (res.From == models.OrderPaid || res.From == models.OrderProcessing),
	}, nil
}

var defaultNotes = map[models.OrderStatus]string{
	models.OrderProcessing: "Estamos preparando tu pedido.",
	models.OrderShipped:    "Tu pedido va en camino.",
	models.OrderDelivered:  "Entregamos tu pedido. ¡Que lo disfrutes!",
}

func toAdminResponse(o *models.Order) AdminOrderResponse {
	r := AdminOrderResponse{
		OrderResponse: toResponse(o), UserID: o.UserID,
		CustomerName: o.CustomerName, CustomerEmail: o.CustomerEmail, CustomerPhone: o.CustomerPhone, CustomerDocument: o.CustomerDocument,
		AllowedNext: allowedNext(o.Status),
	}
	r.OrderResponse.History = nil // el panel usa su propia línea de tiempo (con autor)
	for _, h := range o.History {
		ah := AdminHistoryResponse{
			HistoryResponse: HistoryResponse{Status: h.Status, Label: statusLabels[h.Status], Note: h.Note, CreatedAt: h.CreatedAt},
			ChangedByID:     h.ChangedByID,
		}
		if h.ChangedBy != nil {
			ah.ChangedByName = h.ChangedBy.FullName
		}
		r.History = append(r.History, ah)
	}
	return r
}
