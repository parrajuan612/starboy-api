package catalog

import (
	"context"
	"errors"
	"github.com/juancamiloparra/starboy-api/internal/domain/inventory"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

var (
	errDuplicate     = errors.New("registro duplicado")
	errInUse         = errors.New("registro en uso")
	errConstraint    = errors.New("restricción de la base de datos")
	errImageMismatch = errors.New("las fotos no coinciden con las del producto")
)

// AdminProductFilter filtra el listado del panel (incluye borradores y archivados).
type AdminProductFilter struct {
	Status              string
	BrandID, CategoryID *uuid.UUID
	Search              string
	Offset, Limit       int
}

// AdminRepository es el acceso a datos del CRUD de catálogo.
// Las operaciones que dependen del conteo de fotos corren en una transacción con el producto
// bloqueado (SELECT … FOR UPDATE) y reciben la regla de negocio como función, que vive en el servicio.
type AdminRepository interface {
	// Categorías
	ListAllCategories(ctx context.Context) ([]models.Category, error)
	GetCategory(ctx context.Context, id uuid.UUID) (*models.Category, error)
	CreateCategory(ctx context.Context, c *models.Category) error
	SaveCategory(ctx context.Context, c *models.Category) error
	CategoryRefs(ctx context.Context, id uuid.UUID) (children, products int64, err error)
	DeleteCategory(ctx context.Context, id uuid.UUID) error

	// Marcas
	ListAllBrands(ctx context.Context) ([]models.Brand, error)
	GetBrand(ctx context.Context, id uuid.UUID) (*models.Brand, error)
	CreateBrand(ctx context.Context, b *models.Brand) error
	SaveBrand(ctx context.Context, b *models.Brand) error
	BrandProductCount(ctx context.Context, id uuid.UUID) (int64, error)
	DeleteBrand(ctx context.Context, id uuid.UUID) error

	// Productos
	ListAdminProducts(ctx context.Context, f AdminProductFilter) ([]models.Product, int64, error)
	GetAdminProduct(ctx context.Context, id uuid.UUID) (*models.Product, error)
	CreateProduct(ctx context.Context, p *models.Product) error
	UpdateProduct(ctx context.Context, id uuid.UUID, mutate func(p *models.Product, imageCount int) error) error
	DeleteProduct(ctx context.Context, id uuid.UUID, check func(p *models.Product) error) error

	// Fotos
	AddImage(ctx context.Context, productID uuid.UUID, img *models.ProductImage) error
	DeleteImage(ctx context.Context, productID, imageID uuid.UUID, check func(p *models.Product, remaining int) error) error
	ReorderImages(ctx context.Context, productID uuid.UUID, ids []uuid.UUID) error

	// Variantes
	CreateVariant(ctx context.Context, productID uuid.UUID, v *models.ProductVariant, actor uuid.UUID) error
	UpdateVariant(ctx context.Context, productID, variantID, actor uuid.UUID, mutate func(v *models.ProductVariant) error) error
	DeleteVariant(ctx context.Context, productID, variantID uuid.UUID) error
}

type gormAdminRepository struct{ db *gorm.DB }

// NewAdminRepository crea el repositorio GORM del panel.
func NewAdminRepository(db *gorm.DB) AdminRepository { return &gormAdminRepository{db: db} }

// mapErr traduce los errores de GORM/PostgreSQL (TranslateError: true) a errores del paquete.
func mapErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, gorm.ErrRecordNotFound):
		return errNotFound
	case errors.Is(err, gorm.ErrDuplicatedKey):
		return errDuplicate
	case errors.Is(err, gorm.ErrForeignKeyViolated):
		return errInUse
	case errors.Is(err, gorm.ErrCheckConstraintViolated):
		return errConstraint
	default:
		return err
	}
}

// lockProduct bloquea la fila del producto durante la transacción.
func lockProduct(tx *gorm.DB, id uuid.UUID) (*models.Product, error) {
	var p models.Product
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&p).Error
	if err != nil {
		return nil, mapErr(err)
	}
	return &p, nil
}

func countImages(tx *gorm.DB, productID uuid.UUID) (int, error) {
	var n int64
	err := tx.Model(&models.ProductImage{}).Where("product_id = ?", productID).Count(&n).Error
	return int(n), err
}

// setInactive corrige is_active cuando se creó con false: GORM reemplaza un bool en cero por el
// default del tag (true) al hacer INSERT, así que el false se aplica con un UPDATE explícito.
func setInactive(tx *gorm.DB, model any, wantActive bool) error {
	if wantActive {
		return nil
	}
	return tx.Model(model).UpdateColumn("is_active", false).Error
}

// ---------- Categorías ----------

func (r *gormAdminRepository) ListAllCategories(ctx context.Context) ([]models.Category, error) {
	var cs []models.Category
	err := r.db.WithContext(ctx).Order("sort_order ASC, name ASC").Find(&cs).Error
	return cs, err
}

func (r *gormAdminRepository) GetCategory(ctx context.Context, id uuid.UUID) (*models.Category, error) {
	var c models.Category
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&c).Error; err != nil {
		return nil, mapErr(err)
	}
	return &c, nil
}

func (r *gormAdminRepository) CreateCategory(ctx context.Context, c *models.Category) error {
	active := c.IsActive
	return mapErr(r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(c).Error; err != nil {
			return err
		}
		return setInactive(tx, c, active)
	}))
}

func (r *gormAdminRepository) SaveCategory(ctx context.Context, c *models.Category) error {
	// Select explícito: guarda también los false/0/nil (parent_id a NULL) sin tocar relaciones.
	return mapErr(r.db.WithContext(ctx).Select("parent_id", "name", "slug", "sort_order", "is_active", "updated_at").
		Where("id = ?", c.ID).Updates(c).Error)
}

func (r *gormAdminRepository) CategoryRefs(ctx context.Context, id uuid.UUID) (int64, int64, error) {
	var children, products int64
	if err := r.db.WithContext(ctx).Model(&models.Category{}).Where("parent_id = ?", id).Count(&children).Error; err != nil {
		return 0, 0, err
	}
	err := r.db.WithContext(ctx).Model(&models.Product{}).Where("category_id = ?", id).Count(&products).Error
	return children, products, err
}

func (r *gormAdminRepository) DeleteCategory(ctx context.Context, id uuid.UUID) error {
	res := r.db.WithContext(ctx).Where("id = ?", id).Delete(&models.Category{})
	if res.Error != nil {
		return mapErr(res.Error)
	}
	if res.RowsAffected == 0 {
		return errNotFound
	}
	return nil
}

// ---------- Marcas ----------

func (r *gormAdminRepository) ListAllBrands(ctx context.Context) ([]models.Brand, error) {
	var bs []models.Brand
	err := r.db.WithContext(ctx).Order("name ASC").Find(&bs).Error
	return bs, err
}

func (r *gormAdminRepository) GetBrand(ctx context.Context, id uuid.UUID) (*models.Brand, error) {
	var b models.Brand
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&b).Error; err != nil {
		return nil, mapErr(err)
	}
	return &b, nil
}

func (r *gormAdminRepository) CreateBrand(ctx context.Context, b *models.Brand) error {
	active := b.IsActive
	return mapErr(r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(b).Error; err != nil {
			return err
		}
		return setInactive(tx, b, active)
	}))
}

func (r *gormAdminRepository) SaveBrand(ctx context.Context, b *models.Brand) error {
	return mapErr(r.db.WithContext(ctx).Select("name", "slug", "logo_url", "is_active", "updated_at").
		Where("id = ?", b.ID).Updates(b).Error)
}

func (r *gormAdminRepository) BrandProductCount(ctx context.Context, id uuid.UUID) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&models.Product{}).Where("brand_id = ?", id).Count(&n).Error
	return n, err
}

func (r *gormAdminRepository) DeleteBrand(ctx context.Context, id uuid.UUID) error {
	res := r.db.WithContext(ctx).Where("id = ?", id).Delete(&models.Brand{})
	if res.Error != nil {
		return mapErr(res.Error)
	}
	if res.RowsAffected == 0 {
		return errNotFound
	}
	return nil
}

// ---------- Productos ----------

func (r *gormAdminRepository) ListAdminProducts(ctx context.Context, f AdminProductFilter) ([]models.Product, int64, error) {
	build := func() *gorm.DB {
		q := r.db.WithContext(ctx).Model(&models.Product{})
		if f.Status != "" {
			q = q.Where("products.status = ?", f.Status)
		}
		if f.BrandID != nil {
			q = q.Where("products.brand_id = ?", *f.BrandID)
		}
		if f.CategoryID != nil {
			q = q.Where("products.category_id = ?", *f.CategoryID)
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
	var items []models.Product
	err := build().Preload("Brand").Preload("Category").
		Preload("Images", orderedImages).Preload("Variants", orderedVariants).
		Order("products.created_at DESC, products.id").Offset(f.Offset).Limit(f.Limit).
		Find(&items).Error
	return items, total, err
}

func (r *gormAdminRepository) GetAdminProduct(ctx context.Context, id uuid.UUID) (*models.Product, error) {
	var p models.Product
	err := r.db.WithContext(ctx).
		Preload("Brand").Preload("Category").
		Preload("Images", orderedImages).Preload("Variants", orderedVariants).
		Where("id = ?", id).First(&p).Error
	if err != nil {
		return nil, mapErr(err)
	}
	return &p, nil
}

func (r *gormAdminRepository) CreateProduct(ctx context.Context, p *models.Product) error {
	return mapErr(r.db.WithContext(ctx).Omit("Brand", "Category", "Images", "Variants").Create(p).Error)
}

func (r *gormAdminRepository) UpdateProduct(ctx context.Context, id uuid.UUID, mutate func(*models.Product, int) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		p, err := lockProduct(tx, id)
		if err != nil {
			return err
		}
		n, err := countImages(tx, id)
		if err != nil {
			return err
		}
		if err := mutate(p, n); err != nil {
			return err
		}
		return mapErr(tx.Omit("Brand", "Category", "Images", "Variants").Save(p).Error)
	})
}

func (r *gormAdminRepository) DeleteProduct(ctx context.Context, id uuid.UUID, check func(*models.Product) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		p, err := lockProduct(tx, id)
		if err != nil {
			return err
		}
		if err := check(p); err != nil {
			return err
		}
		return mapErr(tx.Where("id = ?", id).Delete(&models.Product{}).Error)
	})
}

// ---------- Fotos ----------

func (r *gormAdminRepository) AddImage(ctx context.Context, productID uuid.UUID, img *models.ProductImage) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := lockProduct(tx, productID); err != nil {
			return err
		}
		n, err := countImages(tx, productID)
		if err != nil {
			return err
		}
		img.ProductID = productID
		img.Position = n // al final
		return mapErr(tx.Create(img).Error)
	})
}

func (r *gormAdminRepository) DeleteImage(ctx context.Context, productID, imageID uuid.UUID,
	check func(*models.Product, int) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		p, err := lockProduct(tx, productID)
		if err != nil {
			return err
		}
		var img models.ProductImage
		if err := tx.Where("id = ? AND product_id = ?", imageID, productID).First(&img).Error; err != nil {
			return mapErr(err)
		}
		n, err := countImages(tx, productID)
		if err != nil {
			return err
		}
		if err := check(p, n-1); err != nil {
			return err
		}
		if err := tx.Delete(&img).Error; err != nil {
			return err
		}
		// Recompacta posiciones 0..n-1 para que "0 = principal" siga siendo cierto.
		return tx.Exec(`UPDATE product_images SET position = t.rn - 1, updated_at = now()
			FROM (SELECT id, row_number() OVER (ORDER BY position, created_at) AS rn
			      FROM product_images WHERE product_id = ?) t
			WHERE product_images.id = t.id AND product_images.position <> t.rn - 1`, productID).Error
	})
}

func (r *gormAdminRepository) ReorderImages(ctx context.Context, productID uuid.UUID, ids []uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := lockProduct(tx, productID); err != nil {
			return err
		}
		var existing []models.ProductImage
		if err := tx.Where("product_id = ?", productID).Find(&existing).Error; err != nil {
			return err
		}
		if len(existing) != len(ids) {
			return errImageMismatch
		}
		have := make(map[uuid.UUID]bool, len(existing))
		for _, im := range existing {
			have[im.ID] = true
		}
		seen := make(map[uuid.UUID]bool, len(ids))
		for _, id := range ids {
			if !have[id] || seen[id] {
				return errImageMismatch
			}
			seen[id] = true
		}
		for pos, id := range ids {
			if err := tx.Model(&models.ProductImage{}).Where("id = ?", id).Update("position", pos).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ---------- Variantes ----------

func (r *gormAdminRepository) CreateVariant(ctx context.Context, productID uuid.UUID, v *models.ProductVariant, actor uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := lockProduct(tx, productID); err != nil {
			return err
		}
		v.ProductID = productID
		if err := tx.Create(v).Error; err != nil {
			return mapErr(err)
		}
		return inventory.LogAdjustment(tx, v, v.StockOnHand, inventory.Meta{
			ActorID: &actor, Reason: "Stock inicial al crear la variante " + v.SKU,
		})
	})
}

func (r *gormAdminRepository) UpdateVariant(ctx context.Context, productID, variantID, actor uuid.UUID,
	mutate func(*models.ProductVariant) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var v models.ProductVariant
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND product_id = ?", variantID, productID).First(&v).Error
		if err != nil {
			return mapErr(err)
		}
		before := v.StockOnHand
		if err := mutate(&v); err != nil {
			return err
		}
		v.Version++ // bloqueo optimista para los flujos de reserva de stock (H3)
		if err := tx.Save(&v).Error; err != nil {
			return mapErr(err)
		}
		return inventory.LogAdjustment(tx, &v, v.StockOnHand-before, inventory.Meta{
			ActorID: &actor, Reason: "Ajuste manual de stock desde el panel (" + v.SKU + ")",
		})
	})
}

func (r *gormAdminRepository) DeleteVariant(ctx context.Context, productID, variantID uuid.UUID) error {
	res := r.db.WithContext(ctx).Where("id = ? AND product_id = ?", variantID, productID).Delete(&models.ProductVariant{})
	if res.Error != nil {
		return mapErr(res.Error)
	}
	if res.RowsAffected == 0 {
		return errNotFound
	}
	return nil
}
