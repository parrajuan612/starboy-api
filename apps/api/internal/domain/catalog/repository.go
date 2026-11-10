package catalog

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

var errNotFound = errors.New("producto no encontrado")

// SortOrder es una opción de orden ya validada; el SQL sale de una lista cerrada.
type SortOrder string

const (
	SortNewest    SortOrder = "newest"
	SortPriceAsc  SortOrder = "price_asc"
	SortPriceDesc SortOrder = "price_desc"
)

var orderSQL = map[SortOrder]string{
	SortNewest:    "products.published_at DESC NULLS LAST, products.created_at DESC, products.id",
	SortPriceAsc:  "products.base_price_cop ASC, products.id",
	SortPriceDesc: "products.base_price_cop DESC, products.id",
}

// ProductFilter es el filtro del repositorio (independiente de los DTOs HTTP).
type ProductFilter struct {
	Gender, CategorySlug, BrandSlug, Origin, Search string
	MinPrice, MaxPrice                              *int64
	Sort                                            SortOrder
	Offset, Limit                                   int
}

// Repository es el acceso a datos del catálogo público.
type Repository interface {
	ListProducts(ctx context.Context, f ProductFilter) ([]models.Product, int64, error)
	FindProductBySlug(ctx context.Context, slug string) (*models.Product, error)
	ListCategories(ctx context.Context) ([]models.Category, error)
	ListBrands(ctx context.Context) ([]models.Brand, error)
}

type gormRepository struct{ db *gorm.DB }

// NewRepository crea el repositorio GORM.
func NewRepository(db *gorm.DB) Repository { return &gormRepository{db: db} }

// visible: solo productos ACTIVE de marcas activas.
func (r *gormRepository) visible(ctx context.Context) *gorm.DB {
	return r.db.WithContext(ctx).Model(&models.Product{}).
		Where("products.status = ?", models.ProductActive).
		Where("products.brand_id IN (SELECT id FROM brands WHERE is_active)")
}

func orderedImages(db *gorm.DB) *gorm.DB   { return db.Order("position ASC, created_at ASC") }
func orderedVariants(db *gorm.DB) *gorm.DB { return db.Order("sort_order ASC, size ASC") }

func (r *gormRepository) ListProducts(ctx context.Context, f ProductFilter) ([]models.Product, int64, error) {
	// Cada consulta parte de un *gorm.DB nuevo: reusar el de Count() contaminaría el Find().
	build := func() *gorm.DB {
		q := r.visible(ctx)
		switch f.Gender {
		case "":
		case string(models.GenderUnisex):
			q = q.Where("products.gender = ?", models.GenderUnisex)
		default: // MEN / WOMEN incluyen también los UNISEX (adaptabilidad streetwear)
			q = q.Where("products.gender IN (?, ?)", f.Gender, models.GenderUnisex)
		}
		if f.Origin != "" {
			q = q.Where("products.origin = ?", f.Origin)
		}
		if f.CategorySlug != "" { // la categoría y sus hijas directas
			q = q.Where(`products.category_id IN (
				SELECT id FROM categories
				WHERE is_active AND (slug = ? OR parent_id = (SELECT id FROM categories WHERE slug = ?)))`,
				f.CategorySlug, f.CategorySlug)
		}
		if f.BrandSlug != "" {
			q = q.Where("products.brand_id IN (SELECT id FROM brands WHERE slug = ?)", f.BrandSlug)
		}
		if f.MinPrice != nil {
			q = q.Where("products.base_price_cop >= ?", *f.MinPrice)
		}
		if f.MaxPrice != nil {
			q = q.Where("products.base_price_cop <= ?", *f.MaxPrice)
		}
		if f.Search != "" {
			q = q.Where("products.name ILIKE ?", "%"+escapeLike(f.Search)+"%")
		}
		return q
	}

	var total int64
	if err := build().Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if total == 0 || f.Offset >= int(total) {
		return []models.Product{}, total, nil
	}

	order, ok := orderSQL[f.Sort]
	if !ok {
		order = orderSQL[SortNewest]
	}
	var items []models.Product
	err := build().
		Preload("Brand").
		Preload("Images", orderedImages).
		Preload("Variants", orderedVariants).
		Order(order).Offset(f.Offset).Limit(f.Limit).
		Find(&items).Error
	return items, total, err
}

func (r *gormRepository) FindProductBySlug(ctx context.Context, slug string) (*models.Product, error) {
	var p models.Product
	err := r.visible(ctx).
		Preload("Brand").
		Preload("Category").
		Preload("Images", orderedImages).
		Preload("Variants", orderedVariants).
		Where("products.slug = ?", slug).
		First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *gormRepository) ListCategories(ctx context.Context) ([]models.Category, error) {
	var cs []models.Category
	err := r.db.WithContext(ctx).Where("is_active").Order("sort_order ASC, name ASC").Find(&cs).Error
	return cs, err
}

func (r *gormRepository) ListBrands(ctx context.Context) ([]models.Brand, error) {
	var bs []models.Brand
	err := r.db.WithContext(ctx).Where("is_active").Order("name ASC").Find(&bs).Error
	return bs, err
}

// escapeLike neutraliza los comodines de LIKE para que "50%" busque literalmente "50%".
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}
