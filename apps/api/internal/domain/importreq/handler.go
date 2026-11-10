package importreq

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/middleware"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
)

// Handler expone los endpoints de cliente y públicos de /imports.
type Handler struct{ svc *Service }

// NewHandler crea el handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterRoutes: rates y quote son públicos (con rate limit); crear y consultar exigen sesión.
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup, authMW, publicLimiter, writeLimiter gin.HandlerFunc) {
	g := rg.Group("/imports")
	g.GET("/rates", h.rates)
	g.POST("/quote", publicLimiter, h.quote)
	g.POST("", authMW, writeLimiter, h.create)
	g.GET("/my-requests", authMW, h.myRequests)
	g.POST("/:id/quotes/:quoteId/accept", authMW, writeLimiter, h.acceptQuote)
}

func (h *Handler) acceptQuote(c *gin.Context) {
	uid, ok := currentUserID(c)
	if !ok {
		return
	}
	id, ok := idParam(c)
	if !ok {
		return
	}
	qid, err := uuid.Parse(c.Param("quoteId"))
	if err != nil {
		response.Fail(c, apperr.New(apperr.KindBadRequest, "INVALID_ID", "El identificador no es válido."))
		return
	}
	out, err := h.svc.AcceptQuote(c.Request.Context(), uid, id, qid)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func currentUserID(c *gin.Context) (uuid.UUID, bool) {
	claims, ok := middleware.Claims(c)
	if !ok {
		response.Fail(c, apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar."))
		return uuid.Nil, false
	}
	return claims.UserID, true
}

func (h *Handler) rates(c *gin.Context) {
	out, err := h.svc.ListRates(c.Request.Context())
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *Handler) quote(c *gin.Context) {
	var in QuoteRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.Quote(c.Request.Context(), in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *Handler) create(c *gin.Context) {
	uid, ok := currentUserID(c)
	if !ok {
		return
	}
	var in CreateRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.Create(c.Request.Context(), uid, in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusCreated, out)
}

func (h *Handler) myRequests(c *gin.Context) {
	uid, ok := currentUserID(c)
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

// AdminHandler expone la bandeja y el cambio de estado. El grupo ya viene protegido (ADMIN o STAFF).
type AdminHandler struct{ svc *Service }

// NewAdminHandler crea el handler.
func NewAdminHandler(svc *Service) *AdminHandler { return &AdminHandler{svc: svc} }

// RegisterRoutes monta /admin/imports.
func (h *AdminHandler) RegisterRoutes(g *gin.RouterGroup) {
	g.GET("/imports", h.list)
	g.GET("/imports/:id", h.get)
	g.PATCH("/imports/:id/status", h.changeStatus)
}

// RegisterPriceRoutes monta lo que maneja precios; va en el grupo solo ADMIN (STAFF no ve finanzas, SSD §3).
func (h *AdminHandler) RegisterPriceRoutes(g *gin.RouterGroup) {
	g.POST("/imports/:id/quotes", h.createQuote)
	g.GET("/import-rates", h.listRates)
	g.POST("/import-rates", h.createRate)
	g.PATCH("/import-rates/:id", h.updateRate)
}

func (h *AdminHandler) listRates(c *gin.Context) {
	out, err := h.svc.ListAllRates(c.Request.Context())
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *AdminHandler) createRate(c *gin.Context) {
	var in CreateRateRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.CreateRate(c.Request.Context(), in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusCreated, out)
}

func (h *AdminHandler) updateRate(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var in UpdateRateRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.UpdateRate(c.Request.Context(), id, in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *AdminHandler) createQuote(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	adminID, ok := currentUserID(c)
	if !ok {
		return
	}
	var in CreateQuoteRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.CreateQuote(c.Request.Context(), id, adminID, in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusCreated, out)
}

func idParam(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Fail(c, apperr.New(apperr.KindBadRequest, "INVALID_ID", "El identificador no es válido."))
		return uuid.Nil, false
	}
	return id, true
}

func (h *AdminHandler) list(c *gin.Context) {
	var q ListQuery
	if !response.BindQuery(c, &q) {
		return
	}
	items, meta, err := h.svc.ListAll(c.Request.Context(), q)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.Paginated(c, items, meta)
}

func (h *AdminHandler) get(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	out, err := h.svc.Get(c.Request.Context(), id, true)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *AdminHandler) changeStatus(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	adminID, ok := currentUserID(c)
	if !ok {
		return
	}
	var in ChangeStatusRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.ChangeStatus(c.Request.Context(), id, adminID, in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}
