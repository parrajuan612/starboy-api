package catalog

import (
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

// ---------- Categorías ----------

type CreateCategoryRequest struct {
	Name      string     `json:"name" binding:"required,min=2,max=80"`
	Slug      string     `json:"slug" binding:"omitempty,max=100"` // vacío = se genera desde el nombre
	ParentID  *uuid.UUID `json:"parent_id"`
	SortOrder int        `json:"sort_order" binding:"gte=0,lte=10000"`
	IsActive  *bool      `json:"is_active"` // nil = true
}

// UpdateCategoryRequest es parcial: solo se cambia lo que viene en el JSON.
type UpdateCategoryRequest struct {
	Name      *string    `json:"name" binding:"omitempty,min=2,max=80"`
	Slug      *string    `json:"slug" binding:"omitempty,min=2,max=100"`
	ParentID  *uuid.UUID `json:"parent_id"`
	MakeRoot  *bool      `json:"make_root"` // true = convertirla en categoría raíz
	SortOrder *int       `json:"sort_order" binding:"omitempty,gte=0,lte=10000"`
	IsActive  *bool      `json:"is_active"`
}

type AdminCategoryResponse struct {
	ID        uuid.UUID  `json:"id"`
	ParentID  *uuid.UUID `json:"parent_id"`
	Name      string     `json:"name"`
	Slug      string     `json:"slug"`
	SortOrder int        `json:"sort_order"`
	IsActive  bool       `json:"is_active"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// ---------- Marcas ----------

type CreateBrandRequest struct {
	Name     string `json:"name" binding:"required,min=1,max=80"`
	Slug     string `json:"slug" binding:"omitempty,max=100"`
	LogoURL  string `json:"logo_url" binding:"omitempty,url,max=2000"`
	IsActive *bool  `json:"is_active"`
}

type UpdateBrandRequest struct {
	Name     *string `json:"name" binding:"omitempty,min=1,max=80"`
	Slug     *string `json:"slug" binding:"omitempty,min=2,max=100"`
	LogoURL  *string `json:"logo_url" binding:"omitempty,url,max=2000"`
	IsActive *bool   `json:"is_active"`
}

type AdminBrandResponse struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	LogoURL   string    `json:"logo_url,omitempty"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ---------- Productos ----------

// CreateProductRequest: el producto nace siempre en DRAFT; se publica con PATCH status=ACTIVE
// cuando ya tiene las fotos mínimas del manual de marca.
type CreateProductRequest struct {
	BrandID           uuid.UUID `json:"brand_id" binding:"required"`
	CategoryID        uuid.UUID `json:"category_id" binding:"required"`
	Name              string    `json:"name" binding:"required,min=2,max=160"`
	Slug              string    `json:"slug" binding:"omitempty,max=180"`
	Colorway          string    `json:"colorway" binding:"omitempty,max=120"`
	Description       string    `json:"description" binding:"omitempty,max=5000"`
	Gender            string    `json:"gender" binding:"omitempty,oneof=MEN WOMEN UNISEX"`
	Origin            string    `json:"origin" binding:"omitempty,oneof=LOCAL IMPORTED_STOCK"`
	BasePriceCOP      int64     `json:"base_price_cop" binding:"required,gt=0,lte=100000000000"`
	CompareAtPriceCOP int64     `json:"compare_at_price_cop" binding:"gte=0,lte=100000000000"`
	CostCOP           int64     `json:"cost_cop" binding:"gte=0,lte=100000000000"`
	IsNewRelease      bool      `json:"is_new_release"`
	IsFeatured        bool      `json:"is_featured"`
}

type UpdateProductRequest struct {
	BrandID           *uuid.UUID `json:"brand_id"`
	CategoryID        *uuid.UUID `json:"category_id"`
	Name              *string    `json:"name" binding:"omitempty,min=2,max=160"`
	Slug              *string    `json:"slug" binding:"omitempty,min=2,max=180"`
	Colorway          *string    `json:"colorway" binding:"omitempty,max=120"`
	Description       *string    `json:"description" binding:"omitempty,max=5000"`
	Gender            *string    `json:"gender" binding:"omitempty,oneof=MEN WOMEN UNISEX"`
	Origin            *string    `json:"origin" binding:"omitempty,oneof=LOCAL IMPORTED_STOCK"`
	Status            *string    `json:"status" binding:"omitempty,oneof=DRAFT ACTIVE ARCHIVED"`
	BasePriceCOP      *int64     `json:"base_price_cop" binding:"omitempty,gt=0,lte=100000000000"`
	CompareAtPriceCOP *int64     `json:"compare_at_price_cop" binding:"omitempty,gte=0,lte=100000000000"`
	CostCOP           *int64     `json:"cost_cop" binding:"omitempty,gte=0,lte=100000000000"`
	IsNewRelease      *bool      `json:"is_new_release"`
	IsFeatured        *bool      `json:"is_featured"`
}

type AdminProductQuery struct {
	Status     string `form:"status" binding:"omitempty,oneof=DRAFT ACTIVE ARCHIVED"`
	BrandID    string `form:"brand_id" binding:"omitempty,uuid"`
	CategoryID string `form:"category_id" binding:"omitempty,uuid"`
	Q          string `form:"q" binding:"omitempty,max=100"`
	Page       int    `form:"page" binding:"omitempty,gte=1"`
	Limit      int    `form:"limit" binding:"omitempty,gte=1,lte=50"`
}

type AdminImageResponse struct {
	ImageResponse
	PublicID string `json:"public_id"`
}

type AdminVariantResponse struct {
	ID               uuid.UUID         `json:"id"`
	SKU              string            `json:"sku"`
	Size             string            `json:"size"`
	SizeSystem       models.SizeSystem `json:"size_system"`
	PriceOverrideCOP *int64            `json:"price_override_cop"`
	PriceCOP         int64             `json:"price_cop"` // efectivo
	StockOnHand      int               `json:"stock_on_hand"`
	StockReserved    int               `json:"stock_reserved"`
	Available        int               `json:"available"`
	SortOrder        int               `json:"sort_order"`
}

// AdminProductResponse incluye lo interno (costo, estado). Solo sale por /admin.
type AdminProductResponse struct {
	ID                uuid.UUID              `json:"id"`
	Brand             *AdminBrandRef         `json:"brand,omitempty"`
	Category          *AdminCategoryRef      `json:"category,omitempty"`
	Name              string                 `json:"name"`
	Slug              string                 `json:"slug"`
	Colorway          string                 `json:"colorway,omitempty"`
	Description       string                 `json:"description,omitempty"`
	Gender            models.Gender          `json:"gender"`
	Origin            models.ProductOrigin   `json:"origin"`
	Status            models.ProductStatus   `json:"status"`
	BasePriceCOP      int64                  `json:"base_price_cop"`
	CompareAtPriceCOP int64                  `json:"compare_at_price_cop"`
	CostCOP           int64                  `json:"cost_cop"`
	IsNewRelease      bool                   `json:"is_new_release"`
	IsFeatured        bool                   `json:"is_featured"`
	PublishedAt       *time.Time             `json:"published_at"`
	ImageCount        int                    `json:"image_count"`
	ImagesMissing     int                    `json:"images_missing"` // fotos que faltan para poder publicar
	VariantCount      int                    `json:"variant_count"`
	Images            []AdminImageResponse   `json:"images,omitempty"`
	Variants          []AdminVariantResponse `json:"variants,omitempty"`
	CreatedAt         time.Time              `json:"created_at"`
	UpdatedAt         time.Time              `json:"updated_at"`
}

type AdminBrandRef struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Slug string    `json:"slug"`
}

type AdminCategoryRef struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Slug string    `json:"slug"`
}

// ---------- Variantes ----------

type CreateVariantRequest struct {
	SKU              string `json:"sku" binding:"required,min=2,max=60"`
	Size             string `json:"size" binding:"required,min=1,max=20"`
	SizeSystem       string `json:"size_system" binding:"omitempty,oneof=EU US ALPHA ONE"`
	PriceOverrideCOP *int64 `json:"price_override_cop" binding:"omitempty,gte=0,lte=100000000000"` // 0/nil = usa el precio del producto
	StockOnHand      int    `json:"stock_on_hand" binding:"gte=0,lte=100000"`
	SortOrder        int    `json:"sort_order" binding:"gte=0,lte=10000"`
}

type UpdateVariantRequest struct {
	SKU              *string `json:"sku" binding:"omitempty,min=2,max=60"`
	Size             *string `json:"size" binding:"omitempty,min=1,max=20"`
	SizeSystem       *string `json:"size_system" binding:"omitempty,oneof=EU US ALPHA ONE"`
	PriceOverrideCOP *int64  `json:"price_override_cop" binding:"omitempty,gte=0,lte=100000000000"` // 0 = quitar el precio propio
	StockOnHand      *int    `json:"stock_on_hand" binding:"omitempty,gte=0,lte=100000"`
	SortOrder        *int    `json:"sort_order" binding:"omitempty,gte=0,lte=10000"`
}

// ---------- Fotos ----------

// AddImageRequest registra una foto ya subida (la firma de subida a Cloudinary llega en otra fase).
type AddImageRequest struct {
	PublicID string `json:"public_id" binding:"required,max=255"`
	URL      string `json:"url" binding:"required,url,max=2000"`
	Alt      string `json:"alt" binding:"omitempty,max=200"`
}

type ReorderImagesRequest struct {
	ImageIDs []uuid.UUID `json:"image_ids" binding:"required,min=1,max=30"`
}
