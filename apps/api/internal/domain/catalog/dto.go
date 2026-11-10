package catalog

import (
	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

const (
	defaultLimit = 20
	maxLimit     = 50
)

// ListQuery son los parámetros de GET /products. Los valores válidos están acotados
// (oneof / rangos) para que nada arbitrario llegue a la consulta.
type ListQuery struct {
	Gender   string `form:"gender" binding:"omitempty,oneof=MEN WOMEN UNISEX"`
	Category string `form:"category" binding:"omitempty,max=100"` // slug; incluye subcategorías
	Brand    string `form:"brand" binding:"omitempty,max=100"`    // slug
	Origin   string `form:"origin" binding:"omitempty,oneof=LOCAL IMPORTED_STOCK"`
	Q        string `form:"q" binding:"omitempty,max=100"`
	MinPrice *int64 `form:"min_price" binding:"omitempty,gte=0"`
	MaxPrice *int64 `form:"max_price" binding:"omitempty,gte=0"`
	Sort     string `form:"sort" binding:"omitempty,oneof=newest price_asc price_desc"`
	Page     int    `form:"page" binding:"omitempty,gte=1"`
	Limit    int    `form:"limit" binding:"omitempty,gte=1,lte=50"`
}

type BrandRef struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type CategoryRef struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// ProductSummary es la tarjeta del listado. Nunca expone costo ni stock exacto.
type ProductSummary struct {
	ID                uuid.UUID            `json:"id"`
	Slug              string               `json:"slug"`
	Name              string               `json:"name"`
	Colorway          string               `json:"colorway,omitempty"`
	Brand             *BrandRef            `json:"brand,omitempty"`
	Gender            models.Gender        `json:"gender"`
	Origin            models.ProductOrigin `json:"origin"`
	BasePriceCOP      int64                `json:"base_price_cop"`
	CompareAtPriceCOP int64                `json:"compare_at_price_cop"`
	DiscountPercent   int                  `json:"discount_percent"`
	IsNewRelease      bool                 `json:"is_new_release"`
	IsFeatured        bool                 `json:"is_featured"`
	InStock           bool                 `json:"in_stock"`
	Image             *ImageResponse       `json:"image,omitempty"`       // foto principal
	HoverImage        *ImageResponse       `json:"hover_image,omitempty"` // segunda foto (la tarjeta cambia a ella al pasar el mouse)
}

type ImageResponse struct {
	ID       uuid.UUID `json:"id"`
	URL      string    `json:"url"`
	Alt      string    `json:"alt,omitempty"`
	Position int       `json:"position"`
}

type VariantResponse struct {
	ID         uuid.UUID         `json:"id"`
	SKU        string            `json:"sku"`
	Size       string            `json:"size"`
	SizeSystem models.SizeSystem `json:"size_system"`
	PriceCOP   int64             `json:"price_cop"`
	Available  int               `json:"available"`
	InStock    bool              `json:"in_stock"`
}

// ProductDetail es la ficha completa (PDP).
type ProductDetail struct {
	ProductSummary
	Description string            `json:"description,omitempty"`
	Category    *CategoryRef      `json:"category,omitempty"`
	Images      []ImageResponse   `json:"images"`
	Variants    []VariantResponse `json:"variants"`
}

type CategoryResponse struct {
	ID        uuid.UUID          `json:"id"`
	Name      string             `json:"name"`
	Slug      string             `json:"slug"`
	SortOrder int                `json:"sort_order"`
	Children  []CategoryResponse `json:"children"`
}

type BrandResponse struct {
	ID      uuid.UUID `json:"id"`
	Name    string    `json:"name"`
	Slug    string    `json:"slug"`
	LogoURL string    `json:"logo_url,omitempty"`
}
