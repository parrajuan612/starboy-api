package user

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/domain/auth"
	"github.com/juancamiloparra/starboy-api/internal/http/middleware"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
)

// Handler expone PATCH /me y /me/addresses (todo con sesión).
type Handler struct{ svc *Service }

// NewHandler crea el handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterRoutes monta las rutas. writeLimiter protege las escrituras.
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup, authMW, writeLimiter gin.HandlerFunc) {
	rg.PATCH("/me", authMW, writeLimiter, h.updateProfile)
	rg.GET("/me/addresses", authMW, h.listAddresses)
	rg.POST("/me/addresses", authMW, writeLimiter, h.createAddress)
	rg.PATCH("/me/addresses/:id", authMW, writeLimiter, h.updateAddress)
	rg.DELETE("/me/addresses/:id", authMW, writeLimiter, h.deleteAddress)
}

func caller(c *gin.Context) (uuid.UUID, bool) {
	claims, ok := middleware.Claims(c)
	if !ok {
		response.Fail(c, apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar."))
		return uuid.Nil, false
	}
	return claims.UserID, true
}

func idParam(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Fail(c, apperr.New(apperr.KindBadRequest, "INVALID_ID", "El identificador no es válido."))
		return uuid.Nil, false
	}
	return id, true
}

func (h *Handler) updateProfile(c *gin.Context) {
	uid, ok := caller(c)
	if !ok {
		return
	}
	var in UpdateProfileRequest
	if !response.BindJSON(c, &in) {
		return
	}
	u, err := h.svc.UpdateProfile(c.Request.Context(), uid, in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, auth.ToUserResponse(u))
}

func (h *Handler) listAddresses(c *gin.Context) {
	uid, ok := caller(c)
	if !ok {
		return
	}
	out, err := h.svc.ListAddresses(c.Request.Context(), uid)
	if err != nil {
		response.Fail(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	response.JSON(c, http.StatusOK, out)
}

func (h *Handler) createAddress(c *gin.Context) {
	uid, ok := caller(c)
	if !ok {
		return
	}
	var in AddressRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.CreateAddress(c.Request.Context(), uid, in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusCreated, out)
}

func (h *Handler) updateAddress(c *gin.Context) {
	uid, ok := caller(c)
	if !ok {
		return
	}
	id, ok := idParam(c)
	if !ok {
		return
	}
	var in UpdateAddressRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.UpdateAddress(c.Request.Context(), uid, id, in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *Handler) deleteAddress(c *gin.Context) {
	uid, ok := caller(c)
	if !ok {
		return
	}
	id, ok := idParam(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteAddress(c.Request.Context(), uid, id); err != nil {
		response.Fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
