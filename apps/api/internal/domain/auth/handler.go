package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/middleware"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
)

// RefreshCookieName es la cookie httpOnly con el refresh token.
const RefreshCookieName = "sb_refresh"

// Handler expone los endpoints HTTP de autenticación.
type Handler struct {
	svc          *Service
	secureCookie bool
}

// NewHandler crea el handler. secureCookie = true fuera de desarrollo (HTTPS).
func NewHandler(svc *Service, secureCookie bool) *Handler {
	return &Handler{svc: svc, secureCookie: secureCookie}
}

// RegisterRoutes monta /auth/* y /me. limiter protege register/login; authMW protege /me.
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup, authMW, limiter, refreshLimiter gin.HandlerFunc) {
	g := rg.Group("/auth")
	g.POST("/register", limiter, h.register)
	g.POST("/login", limiter, h.login)
	g.POST("/refresh", refreshLimiter, h.refresh)
	g.POST("/logout", h.logout)
	rg.GET("/me", authMW, h.me)
}

func (h *Handler) register(c *gin.Context) {
	var in RegisterRequest
	if !response.BindJSON(c, &in) {
		return
	}
	res, err := h.svc.Register(c.Request.Context(), in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	h.setRefreshCookie(c, res)
	response.JSON(c, http.StatusCreated, res.Body)
}

func (h *Handler) login(c *gin.Context) {
	var in LoginRequest
	if !response.BindJSON(c, &in) {
		return
	}
	res, err := h.svc.Login(c.Request.Context(), in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	h.setRefreshCookie(c, res)
	response.JSON(c, http.StatusOK, res.Body)
}

// refresh renueva el access token con la cookie sb_refresh. Si la cookie no sirve, la borra.
func (h *Handler) refresh(c *gin.Context) {
	raw, _ := c.Cookie(RefreshCookieName)
	res, err := h.svc.Refresh(c.Request.Context(), raw)
	if err != nil {
		h.clearRefreshCookie(c)
		response.Fail(c, err)
		return
	}
	h.setRefreshCookie(c, res)
	response.JSON(c, http.StatusOK, res.Body)
}

// logout borra la cookie de refresh. Es idempotente y no exige sesión válida.
// Nota: los tokens son stateless, así que un access token ya emitido vive hasta que venza (15 min).
func (h *Handler) logout(c *gin.Context) {
	h.clearRefreshCookie(c)
	c.Status(http.StatusNoContent)
}

func (h *Handler) me(c *gin.Context) {
	claims, ok := middleware.Claims(c)
	if !ok {
		response.Fail(c, apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar."))
		return
	}
	u, err := h.svc.Me(c.Request.Context(), claims.UserID)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, u)
}

// setRefreshCookie: httpOnly (JS no la lee), SameSite=Lax, Secure en producción,
// y acotada a /api/v1/auth para que no viaje en cada petición.
func (h *Handler) setRefreshCookie(c *gin.Context, res *Result) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(RefreshCookieName, res.RefreshToken, int(res.RefreshTTL.Seconds()),
		"/api/v1/auth", "", h.secureCookie, true)
}

func (h *Handler) clearRefreshCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(RefreshCookieName, "", -1, "/api/v1/auth", "", h.secureCookie, true)
}
