// Package upload recibe las fotos que sube el panel (POST /admin/uploads).
package upload

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/platform/storage"
)

// Handler sube fotos al almacenamiento. El grupo recibido ya viene protegido con Auth + RequireRole(ADMIN).
type Handler struct{ store *storage.Local }

// NewHandler crea el handler.
func NewHandler(store *storage.Local) *Handler { return &Handler{store: store} }

// RegisterRoutes monta POST /uploads.
func (h *Handler) RegisterRoutes(g *gin.RouterGroup, limiter gin.HandlerFunc) {
	g.POST("/uploads", limiter, h.upload)
}

func (h *Handler) upload(c *gin.Context) {
	// Corta la lectura en el servidor aunque el cliente anuncie un tamaño menor.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, storage.MaxBytes+(1<<20))
	fh, err := c.FormFile("file")
	if err != nil {
		response.Fail(c, apperr.New(apperr.KindValidation, "VALIDATION_ERROR", "Elige una foto para subir.").
			WithDetails(map[string]string{"file": "Elige una foto (JPG, PNG o WebP) de hasta 5 MB."}))
		return
	}
	f, err := fh.Open()
	if err != nil {
		response.Fail(c, apperr.Internal(err))
		return
	}
	defer f.Close()

	out, err := h.store.Save(f)
	switch {
	case errors.Is(err, storage.ErrUnsupported):
		response.Fail(c, apperr.New(apperr.KindValidation, "VALIDATION_ERROR", "Esa foto no se puede subir.").
			WithDetails(map[string]string{"file": "Solo se aceptan fotos JPG, PNG o WebP."}))
	case errors.Is(err, storage.ErrTooLarge):
		response.Fail(c, apperr.New(apperr.KindValidation, "VALIDATION_ERROR", "Esa foto es muy pesada.").
			WithDetails(map[string]string{"file": "La foto pesa más de 5 MB. Comprímela e inténtalo de nuevo."}))
	case err != nil:
		response.Fail(c, apperr.Internal(err))
	default:
		response.JSON(c, http.StatusCreated, out)
	}
}
