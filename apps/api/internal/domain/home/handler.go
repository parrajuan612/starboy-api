package home

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/juancamiloparra/starboy-api/internal/http/response"
)

// Handler expone la portada: lectura pública y edición (solo ADMIN).
type Handler struct{ svc *Service }

// NewHandler crea el handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterPublic monta GET /home.
func (h *Handler) RegisterPublic(rg *gin.RouterGroup) {
	rg.GET("/home", func(c *gin.Context) {
		out, err := h.svc.Public(c.Request.Context())
		if err != nil {
			response.Fail(c, err)
			return
		}
		response.JSON(c, http.StatusOK, out)
	})
}

// RegisterAdmin monta GET/PUT /admin/home (el grupo ya viene protegido con ADMIN).
func (h *Handler) RegisterAdmin(g *gin.RouterGroup) {
	g.GET("/home", func(c *gin.Context) {
		out, err := h.svc.Get(c.Request.Context())
		if err != nil {
			response.Fail(c, err)
			return
		}
		response.JSON(c, http.StatusOK, out)
	})
	g.PUT("/home", func(c *gin.Context) {
		var in Content
		if !response.BindJSON(c, &in) {
			return
		}
		out, err := h.svc.Save(c.Request.Context(), in)
		if err != nil {
			response.Fail(c, err)
			return
		}
		response.JSON(c, http.StatusOK, out)
	})
}
