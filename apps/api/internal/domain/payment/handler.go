package payment

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/middleware"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
	"github.com/juancamiloparra/starboy-api/internal/platform/payments"
)

const maxWebhookBody = 64 << 10 // 64 KiB

// Handler expone los endpoints de pagos.
type Handler struct {
	svc             *Service
	simulatorOnline bool
}

// NewHandler crea el handler. simulatorOnline habilita /payments/:id/simulate (nunca en producción).
func NewHandler(svc *Service, simulatorOnline bool) *Handler {
	return &Handler{svc: svc, simulatorOnline: simulatorOnline}
}

// RegisterRoutes monta /payments. El webhook es público: se autentica con la firma, no con JWT.
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup, authMW, writeLimiter gin.HandlerFunc) {
	g := rg.Group("/payments")
	g.POST("/checkout", authMW, writeLimiter, h.checkout)
	g.POST("/webhook/:provider", h.webhook)
	g.GET("/:id", authMW, h.get)
	if h.simulatorOnline {
		g.POST("/:id/simulate", authMW, h.simulate)
	}
}

// RegisterAdminRoutes monta la bandeja de pagos (grupo solo ADMIN: finanzas, SSD §3).
func (h *Handler) RegisterAdminRoutes(g *gin.RouterGroup) {
	g.GET("/payments", h.list)
}

func caller(c *gin.Context) (uuid.UUID, bool, bool) {
	claims, ok := middleware.Claims(c)
	if !ok {
		response.Fail(c, apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar."))
		return uuid.Nil, false, false
	}
	return claims.UserID, claims.Role == models.RoleAdmin, true
}

func (h *Handler) checkout(c *gin.Context) {
	uid, _, ok := caller(c)
	if !ok {
		return
	}
	var in CheckoutRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.Checkout(c.Request.Context(), uid, in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusCreated, out)
}

func (h *Handler) get(c *gin.Context) {
	uid, admin, ok := caller(c)
	if !ok {
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Fail(c, apperr.New(apperr.KindBadRequest, "INVALID_ID", "El identificador no es válido."))
		return
	}
	out, err := h.svc.Get(c.Request.Context(), id, uid, admin)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *Handler) simulate(c *gin.Context) {
	uid, admin, ok := caller(c)
	if !ok {
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Fail(c, apperr.New(apperr.KindBadRequest, "INVALID_ID", "El identificador no es válido."))
		return
	}
	var in SimulateRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.Simulate(c.Request.Context(), id, uid, admin, in.Outcome)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *Handler) list(c *gin.Context) {
	var q ListQuery
	if !response.BindQuery(c, &q) {
		return
	}
	items, meta, err := h.svc.List(c.Request.Context(), q)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.Paginated(c, items, meta)
}

// webhook recibe la notificación de la pasarela. Orden de defensas: pasarela conocida y habilitada
// -> tamaño del cuerpo -> firma + marca de tiempo -> monto -> idempotencia. Responde 200 también
// ante un evento repetido para que la pasarela deje de reintentar.
func (h *Handler) webhook(c *gin.Context) {
	prov, ok := h.svc.Provider(models.PaymentProvider(strings.ToUpper(c.Param("provider"))))
	if !ok {
		response.Fail(c, apperr.New(apperr.KindNotFound, "NOT_FOUND", "No encontramos lo que buscas."))
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, maxWebhookBody))
	if err != nil {
		response.Fail(c, apperr.New(apperr.KindBadRequest, "INVALID_REQUEST", "No pudimos leer la notificación."))
		return
	}
	ev, err := prov.ParseWebhook(c.Request.Header, body, time.Now())
	switch {
	case errors.Is(err, payments.ErrInvalidSignature):
		response.Fail(c, apperr.New(apperr.KindUnauthorized, "INVALID_SIGNATURE", "Firma inválida."))
		return
	case err != nil:
		response.Fail(c, apperr.New(apperr.KindBadRequest, "INVALID_PAYLOAD", "Notificación inválida."))
		return
	}
	out, err := h.svc.ProcessEvent(c.Request.Context(), prov.Name(), ev)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, gin.H{"received": true, "payment_id": out.ID, "status": out.Status})
}
