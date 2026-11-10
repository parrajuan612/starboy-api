package order

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/middleware"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

var idemKeyRe = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

// Handler expone las órdenes del cliente.
type Handler struct{ svc *Service }

// NewHandler crea el handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterRoutes monta POST /orders, GET /orders/:id y GET /me/orders (todas con sesión).
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup, authMW, writeLimiter gin.HandlerFunc) {
	rg.POST("/orders", authMW, writeLimiter, h.create)
	rg.GET("/orders/:id", authMW, h.get)
	rg.GET("/me/orders", authMW, h.mine)
}

func caller(c *gin.Context) (uuid.UUID, bool, bool) {
	claims, ok := middleware.Claims(c)
	if !ok {
		response.Fail(c, apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar."))
		return uuid.Nil, false, false
	}
	return claims.UserID, claims.Role == models.RoleAdmin, true
}

func (h *Handler) create(c *gin.Context) {
	uid, _, ok := caller(c)
	if !ok {
		return
	}
	var in CreateRequest
	if !response.BindJSON(c, &in) {
		return
	}
	key := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
	if key != "" && !idemKeyRe.MatchString(key) {
		response.Fail(c, apperr.New(apperr.KindBadRequest, "INVALID_IDEMPOTENCY_KEY", "La llave de idempotencia debe tener entre 8 y 64 letras, números, guiones o guion bajo."))
		return
	}
	out, created, err := h.svc.Create(c.Request.Context(), uid, in, key)
	if err != nil {
		response.Fail(c, err)
		return
	}
	// 201 si se creó ahora; 200 si es una repetición del mismo intento (misma llave) y se devuelve la orden original.
	status := http.StatusCreated
	if !created {
		status = http.StatusOK
	}
	response.JSON(c, status, out)
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

func (h *Handler) mine(c *gin.Context) {
	uid, _, ok := caller(c)
	if !ok {
		return
	}
	var q ListQuery
	if !response.BindQuery(c, &q) {
		return
	}
	items, meta, err := h.svc.ListMine(c.Request.Context(), uid, q)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.Paginated(c, items, meta)
}

// AdminHandler expone la gestión de órdenes del panel (ADMIN y STAFF).
type AdminHandler struct{ svc *Service }

// NewAdminHandler crea el handler del panel.
func NewAdminHandler(svc *Service) *AdminHandler { return &AdminHandler{svc: svc} }

// RegisterRoutes monta GET /orders, GET /orders/:id y PATCH /orders/:id/status bajo el grupo /admin.
func (h *AdminHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/orders", h.list)
	rg.GET("/orders/:id", h.get)
	rg.PATCH("/orders/:id/status", h.updateStatus)
}

func (h *AdminHandler) list(c *gin.Context) {
	var q AdminListQuery
	if !response.BindQuery(c, &q) {
		return
	}
	items, meta, err := h.svc.AdminList(c.Request.Context(), q)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.Paginated(c, items, meta)
}

func orderID(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Fail(c, apperr.New(apperr.KindBadRequest, "INVALID_ID", "El identificador no es válido."))
		return uuid.Nil, false
	}
	return id, true
}

func (h *AdminHandler) get(c *gin.Context) {
	id, ok := orderID(c)
	if !ok {
		return
	}
	out, err := h.svc.AdminGet(c.Request.Context(), id)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *AdminHandler) updateStatus(c *gin.Context) {
	actor, _, ok := caller(c)
	if !ok {
		return
	}
	id, ok := orderID(c)
	if !ok {
		return
	}
	var in UpdateStatusRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.UpdateStatus(c.Request.Context(), id, actor, in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}
