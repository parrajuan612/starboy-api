package catalog

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/juancamiloparra/starboy-api/internal/http/response"
)

// Handler expone el catálogo público.
type Handler struct{ svc *Service }

// NewHandler crea el handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterRoutes monta los endpoints públicos del catálogo.
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/products", h.list)
	rg.GET("/products/:slug", h.detail)
	rg.GET("/categories", h.categories)
	rg.GET("/brands", h.brands)
}

func (h *Handler) list(c *gin.Context) {
	var q ListQuery
	if !response.BindQuery(c, &q) {
		return
	}
	items, meta, err := h.svc.ListProducts(c.Request.Context(), q)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.Paginated(c, items, meta)
}

func (h *Handler) detail(c *gin.Context) {
	p, err := h.svc.GetProduct(c.Request.Context(), c.Param("slug"))
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, p)
}

func (h *Handler) categories(c *gin.Context) {
	cs, err := h.svc.ListCategories(c.Request.Context())
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, cs)
}

func (h *Handler) brands(c *gin.Context) {
	bs, err := h.svc.ListBrands(c.Request.Context())
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, bs)
}
