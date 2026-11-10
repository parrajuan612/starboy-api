package catalog

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/middleware"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
)

// AdminHandler expone el CRUD de catálogo. El grupo recibido ya viene protegido con Auth + RequireRole(ADMIN).
type AdminHandler struct{ svc *AdminService }

// NewAdminHandler crea el handler.
func NewAdminHandler(svc *AdminService) *AdminHandler { return &AdminHandler{svc: svc} }

// RegisterRoutes monta las rutas bajo /admin.
func (h *AdminHandler) RegisterRoutes(g *gin.RouterGroup) {
	g.GET("/categories", h.listCategories)
	g.POST("/categories", h.createCategory)
	g.PATCH("/categories/:id", h.updateCategory)
	g.DELETE("/categories/:id", h.deleteCategory)

	g.GET("/brands", h.listBrands)
	g.POST("/brands", h.createBrand)
	g.PATCH("/brands/:id", h.updateBrand)
	g.DELETE("/brands/:id", h.deleteBrand)

	g.GET("/products", h.listProducts)
	g.POST("/products", h.createProduct)
	g.GET("/products/:id", h.getProduct)
	g.PATCH("/products/:id", h.updateProduct)
	g.DELETE("/products/:id", h.deleteProduct)

	g.POST("/products/:id/variants", h.createVariant)
	g.PATCH("/products/:id/variants/:variantId", h.updateVariant)
	g.DELETE("/products/:id/variants/:variantId", h.deleteVariant)

	g.POST("/products/:id/images", h.addImage)
	g.PATCH("/products/:id/images/order", h.reorderImages)
	g.DELETE("/products/:id/images/:imageId", h.deleteImage)
}

// uuidParam lee un UUID de la ruta; si no es válido responde 400 y devuelve false.
func uuidParam(c *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil {
		response.Fail(c, apperr.New(apperr.KindBadRequest, "INVALID_ID", "El identificador no es válido."))
		return uuid.Nil, false
	}
	return id, true
}

// reply envía data o el error, según corresponda.
func reply[T any](c *gin.Context, status int, data *T, err error) {
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, status, data)
}

func noContent(c *gin.Context, err error) {
	if err != nil {
		response.Fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// ---------- Categorías ----------

func (h *AdminHandler) listCategories(c *gin.Context) {
	out, err := h.svc.ListCategories(c.Request.Context())
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *AdminHandler) createCategory(c *gin.Context) {
	var in CreateCategoryRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.CreateCategory(c.Request.Context(), in)
	reply(c, http.StatusCreated, out, err)
}

func (h *AdminHandler) updateCategory(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var in UpdateCategoryRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.UpdateCategory(c.Request.Context(), id, in)
	reply(c, http.StatusOK, out, err)
}

func (h *AdminHandler) deleteCategory(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	noContent(c, h.svc.DeleteCategory(c.Request.Context(), id))
}

// ---------- Marcas ----------

func (h *AdminHandler) listBrands(c *gin.Context) {
	out, err := h.svc.ListBrands(c.Request.Context())
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *AdminHandler) createBrand(c *gin.Context) {
	var in CreateBrandRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.CreateBrand(c.Request.Context(), in)
	reply(c, http.StatusCreated, out, err)
}

func (h *AdminHandler) updateBrand(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var in UpdateBrandRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.UpdateBrand(c.Request.Context(), id, in)
	reply(c, http.StatusOK, out, err)
}

func (h *AdminHandler) deleteBrand(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	noContent(c, h.svc.DeleteBrand(c.Request.Context(), id))
}

// ---------- Productos ----------

func (h *AdminHandler) listProducts(c *gin.Context) {
	var q AdminProductQuery
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

func (h *AdminHandler) createProduct(c *gin.Context) {
	var in CreateProductRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.CreateProduct(c.Request.Context(), in)
	reply(c, http.StatusCreated, out, err)
}

func (h *AdminHandler) getProduct(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	out, err := h.svc.GetProduct(c.Request.Context(), id)
	reply(c, http.StatusOK, out, err)
}

func (h *AdminHandler) updateProduct(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var in UpdateProductRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.UpdateProduct(c.Request.Context(), id, in)
	reply(c, http.StatusOK, out, err)
}

func (h *AdminHandler) deleteProduct(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	noContent(c, h.svc.DeleteProduct(c.Request.Context(), id))
}

// ---------- Variantes ----------

func (h *AdminHandler) createVariant(c *gin.Context) {
	actor, ok := actorID(c)
	if !ok {
		return
	}
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var in CreateVariantRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.CreateVariant(c.Request.Context(), actor, id, in)
	reply(c, http.StatusCreated, out, err)
}

func (h *AdminHandler) updateVariant(c *gin.Context) {
	actor, ok := actorID(c)
	if !ok {
		return
	}
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	vid, ok := uuidParam(c, "variantId")
	if !ok {
		return
	}
	var in UpdateVariantRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.UpdateVariant(c.Request.Context(), actor, id, vid, in)
	reply(c, http.StatusOK, out, err)
}

func (h *AdminHandler) deleteVariant(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	vid, ok := uuidParam(c, "variantId")
	if !ok {
		return
	}
	out, err := h.svc.DeleteVariant(c.Request.Context(), id, vid)
	reply(c, http.StatusOK, out, err)
}

// ---------- Fotos ----------

func (h *AdminHandler) addImage(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var in AddImageRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.AddImage(c.Request.Context(), id, in)
	reply(c, http.StatusCreated, out, err)
}

func (h *AdminHandler) reorderImages(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var in ReorderImagesRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.ReorderImages(c.Request.Context(), id, in)
	reply(c, http.StatusOK, out, err)
}

func (h *AdminHandler) deleteImage(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	imgID, ok := uuidParam(c, "imageId")
	if !ok {
		return
	}
	out, err := h.svc.DeleteImage(c.Request.Context(), id, imgID)
	reply(c, http.StatusOK, out, err)
}

// actorID es el admin autenticado; queda registrado en la bitácora de inventario.
func actorID(c *gin.Context) (uuid.UUID, bool) {
	claims, ok := middleware.Claims(c)
	if !ok {
		response.Fail(c, apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar."))
		return uuid.Nil, false
	}
	return claims.UserID, true
}
