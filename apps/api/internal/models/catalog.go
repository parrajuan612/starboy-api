package models

import (
	"time"

	"github.com/google/uuid"
)

// Gender segmenta el catálogo (menú Hombre / Mujer).
type Gender string

const (
	GenderMen    Gender = "MEN"
	GenderWomen  Gender = "WOMEN"
	GenderUnisex Gender = "UNISEX"
)

// ProductOrigin distingue stock local de stock importado ("Stock disponible").
type ProductOrigin string

const (
	OriginLocal         ProductOrigin = "LOCAL"
	OriginImportedStock ProductOrigin = "IMPORTED_STOCK"
)

// ProductStatus controla la visibilidad en la tienda.
type ProductStatus string

const (
	ProductDraft    ProductStatus = "DRAFT"
	ProductActive   ProductStatus = "ACTIVE"
	ProductArchived ProductStatus = "ARCHIVED"
)

// MinImagesToPublish es el mínimo de fotos que exige el manual de marca para la PDP
// (lateral, superior, trasera, suela o detalle). Lo valida domain/catalog al publicar.
const MinImagesToPublish = 4

// SizeSystem indica cómo leer la talla de una variante.
type SizeSystem string

const (
	SizeEU    SizeSystem = "EU"    // calzado 38–46
	SizeUS    SizeSystem = "US"    // calzado US 7–12
	SizeAlpha SizeSystem = "ALPHA" // ropa XS–XXL
	SizeOne   SizeSystem = "ONE"   // talla única
)

// Brand es una marca (Nike, Jordan, New Balance, Adidas…).
type Brand struct {
	Base
	Name     string    `gorm:"type:varchar(80);not null;uniqueIndex" json:"name"`
	Slug     string    `gorm:"type:varchar(100);not null;uniqueIndex" json:"slug"`
	LogoURL  string    `gorm:"type:text" json:"logo_url,omitempty"`
	IsActive bool      `gorm:"not null;default:true" json:"is_active"`
	Products []Product `json:"-"`
}

// Category es jerárquica: Zapatos → Sneakers, Ropa → Hoodies…
type Category struct {
	Base
	ParentID  *uuid.UUID `gorm:"type:uuid;index" json:"parent_id,omitempty"`
	Parent    *Category  `gorm:"constraint:OnDelete:RESTRICT" json:"parent,omitempty"`
	Children  []Category `gorm:"foreignKey:ParentID" json:"children,omitempty"`
	Name      string     `gorm:"type:varchar(80);not null" json:"name"`
	Slug      string     `gorm:"type:varchar(100);not null;uniqueIndex" json:"slug"`
	SortOrder int        `gorm:"not null;default:0" json:"sort_order"`
	IsActive  bool       `gorm:"not null;default:true" json:"is_active"`
}

// Product es la ficha comercial. El stock vive en las variantes (tallas).
type Product struct {
	Base
	BrandID    uuid.UUID `gorm:"type:uuid;not null;index" json:"brand_id"`
	Brand      *Brand    `gorm:"constraint:OnDelete:RESTRICT" json:"brand,omitempty"`
	CategoryID uuid.UUID `gorm:"type:uuid;not null;index:idx_products_listing,priority:3" json:"category_id"`
	Category   *Category `gorm:"constraint:OnDelete:RESTRICT" json:"category,omitempty"`

	Name        string        `gorm:"type:varchar(160);not null" json:"name"`
	Slug        string        `gorm:"type:varchar(180);not null;uniqueIndex" json:"slug"`
	Colorway    string        `gorm:"type:varchar(120)" json:"colorway,omitempty"` // "White Oreo", "Panda"
	Description string        `gorm:"type:text" json:"description,omitempty"`
	Gender      Gender        `gorm:"type:varchar(10);not null;default:'UNISEX';index:idx_products_listing,priority:2;check:chk_products_gender,gender IN ('MEN','WOMEN','UNISEX')" json:"gender"`
	Origin      ProductOrigin `gorm:"type:varchar(20);not null;default:'LOCAL';index;check:chk_products_origin,origin IN ('LOCAL','IMPORTED_STOCK')" json:"origin"`
	Status      ProductStatus `gorm:"type:varchar(10);not null;default:'DRAFT';index:idx_products_listing,priority:1;check:chk_products_status,status IN ('DRAFT','ACTIVE','ARCHIVED')" json:"status"`

	BasePriceCOP      int64 `gorm:"not null;check:chk_products_price,base_price_cop >= 0" json:"base_price_cop"`
	CompareAtPriceCOP int64 `gorm:"not null;default:0" json:"compare_at_price_cop"` // precio tachado (0 = sin promo)
	CostCOP           int64 `gorm:"not null;default:0" json:"-"`                    // costo interno, nunca sale en la tienda

	IsNewRelease bool       `gorm:"not null;default:false;index" json:"is_new_release"`
	IsFeatured   bool       `gorm:"not null;default:false" json:"is_featured"`
	PublishedAt  *time.Time `json:"published_at,omitempty"`

	Images   []ProductImage   `gorm:"constraint:OnDelete:CASCADE" json:"images,omitempty"`
	Variants []ProductVariant `gorm:"constraint:OnDelete:CASCADE" json:"variants,omitempty"`
}

// DiscountPercent calcula el % del badge (-40%) de la tarjeta.
func (p Product) DiscountPercent() int {
	if p.CompareAtPriceCOP == 0 || p.CompareAtPriceCOP <= p.BasePriceCOP {
		return 0
	}
	return int((p.CompareAtPriceCOP - p.BasePriceCOP) * 100 / p.CompareAtPriceCOP)
}

// ProductImage es una foto en Cloudinary. Position 0 = imagen principal
// (producto de perfil, punta hacia la izquierda, sobre blanco — §12.6).
type ProductImage struct {
	Base
	ProductID uuid.UUID `gorm:"type:uuid;not null;index" json:"product_id"`
	PublicID  string    `gorm:"type:varchar(255);not null" json:"public_id"` // id en Cloudinary
	URL       string    `gorm:"type:text;not null" json:"url"`
	Alt       string    `gorm:"type:varchar(200)" json:"alt,omitempty"`
	Position  int       `gorm:"not null;default:0" json:"position"`
}

// ProductVariant es una talla vendible con SKU y stock propios.
type ProductVariant struct {
	Base
	ProductID        uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:uq_variant_product_size" json:"product_id"`
	SKU              string     `gorm:"type:varchar(60);not null;uniqueIndex" json:"sku"`
	Size             string     `gorm:"type:varchar(20);not null;uniqueIndex:uq_variant_product_size" json:"size"` // "42", "M", "US 9"
	SizeSystem       SizeSystem `gorm:"type:varchar(10);not null;default:'EU';check:chk_variants_size_system,size_system IN ('EU','US','ALPHA','ONE')" json:"size_system"`
	PriceOverrideCOP *int64     `json:"price_override_cop,omitempty"` // nil = usa el precio del producto
	StockOnHand      int        `gorm:"not null;default:0;check:chk_variants_on_hand,stock_on_hand >= 0" json:"stock_on_hand"`
	StockReserved    int        `gorm:"not null;default:0;check:chk_variants_reserved,stock_reserved >= 0 AND stock_reserved <= stock_on_hand" json:"stock_reserved"`
	SortOrder        int        `gorm:"not null;default:0" json:"sort_order"`
	Version          int        `gorm:"not null;default:1" json:"-"` // bloqueo optimista
}

// Available es el stock vendible ahora.
func (v ProductVariant) Available() int { return v.StockOnHand - v.StockReserved }

// EffectivePriceCOP devuelve el precio de la variante o, si no tiene, el del producto.
func (v ProductVariant) EffectivePriceCOP(p Product) int64 {
	if v.PriceOverrideCOP != nil {
		return *v.PriceOverrideCOP
	}
	return p.BasePriceCOP
}
