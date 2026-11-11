package catalog

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
	"github.com/juancamiloparra/starboy-api/internal/platform/storage"
)

var (
	slugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	skuRe  = regexp.MustCompile(`^[A-Z0-9][A-Z0-9._-]*$`)

	accents = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n")
)

// slugify: "Camisetas Básicas" -> "camisetas-basicas".
func slugify(s string, maxLen int) string {
	s = accents.Replace(strings.ToLower(strings.TrimSpace(s)))
	var b strings.Builder
	dash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			dash = false
		} else if !dash && b.Len() > 0 && (unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r)) {
			b.WriteByte('-')
			dash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) > maxLen {
		out = strings.Trim(out[:maxLen], "-")
	}
	return out
}

func fieldErr(field, msg string) *apperr.Error {
	return apperr.New(apperr.KindValidation, "VALIDATION_ERROR", "Revisa los datos que enviaste.").
		WithDetails(map[string]string{field: msg})
}

func notFound(code, msg string) *apperr.Error { return apperr.New(apperr.KindNotFound, code, msg) }
func conflict(code, msg string) *apperr.Error { return apperr.New(apperr.KindConflict, code, msg) }

// resolveSlug usa el slug enviado (validado) o lo genera desde el texto base.
func resolveSlug(given, base string, maxLen int) (string, *apperr.Error) {
	slug := strings.TrimSpace(given)
	if slug == "" {
		slug = slugify(base, maxLen)
	}
	if slug == "" || !slugRe.MatchString(slug) {
		return "", fieldErr("slug", "Usa solo minúsculas, números y guiones (ej. air-jordan-4).")
	}
	return slug, nil
}

// AdminService contiene las reglas del CRUD de catálogo.
type AdminService struct {
	repo AdminRepository
	// removeFile borra el archivo de una foto eliminada (mejor esfuerzo: si falla, solo queda un archivo huérfano).
	removeFile func(publicID string)
}

// NewAdminService crea el servicio.
func NewAdminService(repo AdminRepository) *AdminService { return &AdminService{repo: repo} }

// WithFileRemover conecta el borrado de archivos al eliminar una foto.
func (s *AdminService) WithFileRemover(fn func(publicID string)) *AdminService {
	s.removeFile = fn
	return s
}

// ======================= Categorías =======================

func (s *AdminService) ListCategories(ctx context.Context) ([]AdminCategoryResponse, error) {
	cs, err := s.repo.ListAllCategories(ctx)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	out := make([]AdminCategoryResponse, 0, len(cs))
	for i := range cs {
		out = append(out, toAdminCategory(&cs[i]))
	}
	return out, nil
}

// checkParent exige que el padre exista y sea raíz (el árbol tiene máximo 2 niveles).
func (s *AdminService) checkParent(ctx context.Context, parentID uuid.UUID) *apperr.Error {
	parent, err := s.repo.GetCategory(ctx, parentID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return fieldErr("parent_id", "La categoría padre no existe.")
		}
		return apperr.Internal(err)
	}
	if parent.ParentID != nil {
		return fieldErr("parent_id", "Solo se permiten dos niveles: la categoría padre debe ser una categoría principal.")
	}
	return nil
}

func (s *AdminService) CreateCategory(ctx context.Context, in CreateCategoryRequest) (*AdminCategoryResponse, error) {
	slug, aerr := resolveSlug(in.Slug, in.Name, 100)
	if aerr != nil {
		return nil, aerr
	}
	if in.ParentID != nil {
		if aerr := s.checkParent(ctx, *in.ParentID); aerr != nil {
			return nil, aerr
		}
	}
	c := &models.Category{
		ParentID: in.ParentID, Name: strings.TrimSpace(in.Name), Slug: slug,
		SortOrder: in.SortOrder, IsActive: in.IsActive == nil || *in.IsActive,
	}
	if err := s.repo.CreateCategory(ctx, c); err != nil {
		if errors.Is(err, errDuplicate) {
			return nil, conflict("SLUG_TAKEN", "Ya existe una categoría con ese slug.")
		}
		return nil, apperr.Internal(err)
	}
	r := toAdminCategory(c)
	return &r, nil
}

func (s *AdminService) UpdateCategory(ctx context.Context, id uuid.UUID, in UpdateCategoryRequest) (*AdminCategoryResponse, error) {
	c, err := s.repo.GetCategory(ctx, id)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return nil, notFound("CATEGORY_NOT_FOUND", "No encontramos esa categoría.")
		}
		return nil, apperr.Internal(err)
	}
	if in.ParentID != nil && in.MakeRoot != nil && *in.MakeRoot {
		return nil, fieldErr("make_root", "No puedes enviar parent_id y make_root a la vez.")
	}
	if in.ParentID != nil {
		if *in.ParentID == c.ID {
			return nil, fieldErr("parent_id", "Una categoría no puede ser su propia padre.")
		}
		children, _, err := s.repo.CategoryRefs(ctx, c.ID)
		if err != nil {
			return nil, apperr.Internal(err)
		}
		if children > 0 {
			return nil, fieldErr("parent_id", "Esta categoría tiene subcategorías; muévelas primero (máximo dos niveles).")
		}
		if aerr := s.checkParent(ctx, *in.ParentID); aerr != nil {
			return nil, aerr
		}
		c.ParentID = in.ParentID
	}
	if in.MakeRoot != nil && *in.MakeRoot {
		c.ParentID = nil
	}
	if in.Name != nil {
		c.Name = strings.TrimSpace(*in.Name)
	}
	if in.Slug != nil {
		slug, aerr := resolveSlug(*in.Slug, "", 100)
		if aerr != nil {
			return nil, aerr
		}
		c.Slug = slug
	}
	if in.SortOrder != nil {
		c.SortOrder = *in.SortOrder
	}
	if in.IsActive != nil {
		c.IsActive = *in.IsActive
	}
	c.UpdatedAt = time.Now().UTC()
	if err := s.repo.SaveCategory(ctx, c); err != nil {
		if errors.Is(err, errDuplicate) {
			return nil, conflict("SLUG_TAKEN", "Ya existe una categoría con ese slug.")
		}
		return nil, apperr.Internal(err)
	}
	r := toAdminCategory(c)
	return &r, nil
}

func (s *AdminService) DeleteCategory(ctx context.Context, id uuid.UUID) error {
	children, products, err := s.repo.CategoryRefs(ctx, id)
	if err != nil {
		return apperr.Internal(err)
	}
	if children > 0 || products > 0 {
		return conflict("CATEGORY_IN_USE", "No puedes eliminar una categoría con subcategorías o productos. Desactívala en su lugar.").
			WithDetails(map[string]int64{"subcategories": children, "products": products})
	}
	if err := s.repo.DeleteCategory(ctx, id); err != nil {
		switch {
		case errors.Is(err, errNotFound):
			return notFound("CATEGORY_NOT_FOUND", "No encontramos esa categoría.")
		case errors.Is(err, errInUse):
			return conflict("CATEGORY_IN_USE", "La categoría está en uso. Desactívala en su lugar.")
		}
		return apperr.Internal(err)
	}
	return nil
}

// ======================= Marcas =======================

func (s *AdminService) ListBrands(ctx context.Context) ([]AdminBrandResponse, error) {
	bs, err := s.repo.ListAllBrands(ctx)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	out := make([]AdminBrandResponse, 0, len(bs))
	for i := range bs {
		out = append(out, toAdminBrand(&bs[i]))
	}
	return out, nil
}

func (s *AdminService) CreateBrand(ctx context.Context, in CreateBrandRequest) (*AdminBrandResponse, error) {
	slug, aerr := resolveSlug(in.Slug, in.Name, 100)
	if aerr != nil {
		return nil, aerr
	}
	if aerr := checkHTTPS("logo_url", in.LogoURL); aerr != nil {
		return nil, aerr
	}
	b := &models.Brand{Name: strings.TrimSpace(in.Name), Slug: slug, LogoURL: in.LogoURL, IsActive: in.IsActive == nil || *in.IsActive}
	if err := s.repo.CreateBrand(ctx, b); err != nil {
		if errors.Is(err, errDuplicate) {
			return nil, conflict("BRAND_EXISTS", "Ya existe una marca con ese nombre o slug.")
		}
		return nil, apperr.Internal(err)
	}
	r := toAdminBrand(b)
	return &r, nil
}

func (s *AdminService) UpdateBrand(ctx context.Context, id uuid.UUID, in UpdateBrandRequest) (*AdminBrandResponse, error) {
	b, err := s.repo.GetBrand(ctx, id)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return nil, notFound("BRAND_NOT_FOUND", "No encontramos esa marca.")
		}
		return nil, apperr.Internal(err)
	}
	if in.Name != nil {
		b.Name = strings.TrimSpace(*in.Name)
	}
	if in.Slug != nil {
		slug, aerr := resolveSlug(*in.Slug, "", 100)
		if aerr != nil {
			return nil, aerr
		}
		b.Slug = slug
	}
	if in.LogoURL != nil {
		if aerr := checkHTTPS("logo_url", *in.LogoURL); aerr != nil {
			return nil, aerr
		}
		b.LogoURL = *in.LogoURL
	}
	if in.IsActive != nil {
		b.IsActive = *in.IsActive
	}
	b.UpdatedAt = time.Now().UTC()
	if err := s.repo.SaveBrand(ctx, b); err != nil {
		if errors.Is(err, errDuplicate) {
			return nil, conflict("BRAND_EXISTS", "Ya existe una marca con ese nombre o slug.")
		}
		return nil, apperr.Internal(err)
	}
	r := toAdminBrand(b)
	return &r, nil
}

func (s *AdminService) DeleteBrand(ctx context.Context, id uuid.UUID) error {
	n, err := s.repo.BrandProductCount(ctx, id)
	if err != nil {
		return apperr.Internal(err)
	}
	if n > 0 {
		return conflict("BRAND_IN_USE", "No puedes eliminar una marca con productos. Desactívala en su lugar.").
			WithDetails(map[string]int64{"products": n})
	}
	if err := s.repo.DeleteBrand(ctx, id); err != nil {
		switch {
		case errors.Is(err, errNotFound):
			return notFound("BRAND_NOT_FOUND", "No encontramos esa marca.")
		case errors.Is(err, errInUse):
			return conflict("BRAND_IN_USE", "La marca está en uso. Desactívala en su lugar.")
		}
		return apperr.Internal(err)
	}
	return nil
}

// ======================= Productos =======================

// needsImages es la regla de marca (SSD RF-21): ACTIVE exige MinImagesToPublish fotos.
func needsImages(have int) *apperr.Error {
	if have >= models.MinImagesToPublish {
		return nil
	}
	return apperr.New(apperr.KindValidation, "PRODUCT_NEEDS_IMAGES",
		"Para publicar este producto necesitas al menos 4 fotos (lateral, superior, trasera y suela o detalle).").
		WithDetails(map[string]int{
			"required": models.MinImagesToPublish, "current": have, "missing": models.MinImagesToPublish - have,
		})
}

func (s *AdminService) ListProducts(ctx context.Context, q AdminProductQuery) ([]AdminProductResponse, response.Meta, error) {
	page, limit := q.Page, q.Limit
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = defaultLimit
	}
	f := AdminProductFilter{Status: q.Status, Search: strings.TrimSpace(q.Q), Offset: (page - 1) * limit, Limit: limit}
	if q.BrandID != "" {
		id, _ := uuid.Parse(q.BrandID) // ya validado por el binding
		f.BrandID = &id
	}
	if q.CategoryID != "" {
		id, _ := uuid.Parse(q.CategoryID)
		f.CategoryID = &id
	}
	items, total, err := s.repo.ListAdminProducts(ctx, f)
	if err != nil {
		return nil, response.Meta{}, apperr.Internal(err)
	}
	out := make([]AdminProductResponse, 0, len(items))
	for i := range items {
		out = append(out, toAdminProduct(&items[i], false))
	}
	return out, response.NewMeta(page, limit, total), nil
}

func (s *AdminService) GetProduct(ctx context.Context, id uuid.UUID) (*AdminProductResponse, error) {
	p, err := s.repo.GetAdminProduct(ctx, id)
	if err != nil {
		return nil, productErr(err)
	}
	r := toAdminProduct(p, true)
	return &r, nil
}

func productErr(err error) error {
	if errors.Is(err, errNotFound) {
		return notFound("PRODUCT_NOT_FOUND", "No encontramos ese producto.")
	}
	return apperr.Internal(err)
}

// refsExist valida que marca y categoría existan (si se enviaron).
func (s *AdminService) refsExist(ctx context.Context, brandID, categoryID *uuid.UUID) *apperr.Error {
	if brandID != nil {
		if _, err := s.repo.GetBrand(ctx, *brandID); err != nil {
			if errors.Is(err, errNotFound) {
				return fieldErr("brand_id", "La marca no existe.")
			}
			return apperr.Internal(err)
		}
	}
	if categoryID != nil {
		if _, err := s.repo.GetCategory(ctx, *categoryID); err != nil {
			if errors.Is(err, errNotFound) {
				return fieldErr("category_id", "La categoría no existe.")
			}
			return apperr.Internal(err)
		}
	}
	return nil
}

func checkCompareAt(base, compare int64) *apperr.Error {
	if compare != 0 && compare <= base {
		return fieldErr("compare_at_price_cop", "El precio tachado debe ser mayor que el precio actual (o 0 si no hay promo).")
	}
	return nil
}

func (s *AdminService) CreateProduct(ctx context.Context, in CreateProductRequest) (*AdminProductResponse, error) {
	if aerr := s.refsExist(ctx, &in.BrandID, &in.CategoryID); aerr != nil {
		return nil, aerr
	}
	if aerr := checkCompareAt(in.BasePriceCOP, in.CompareAtPriceCOP); aerr != nil {
		return nil, aerr
	}
	slug, aerr := resolveSlug(in.Slug, in.Name+" "+in.Colorway, 180)
	if aerr != nil {
		return nil, aerr
	}
	p := &models.Product{
		BrandID: in.BrandID, CategoryID: in.CategoryID,
		Name: strings.TrimSpace(in.Name), Slug: slug,
		Colorway: strings.TrimSpace(in.Colorway), Description: in.Description,
		Gender:       orDefault(models.Gender(in.Gender), models.GenderUnisex),
		Origin:       orDefault(models.ProductOrigin(in.Origin), models.OriginLocal),
		Status:       models.ProductDraft,
		BasePriceCOP: in.BasePriceCOP, CompareAtPriceCOP: in.CompareAtPriceCOP, CostCOP: in.CostCOP,
		IsNewRelease: in.IsNewRelease, IsFeatured: in.IsFeatured,
	}
	if err := s.repo.CreateProduct(ctx, p); err != nil {
		if errors.Is(err, errDuplicate) {
			return nil, conflict("SLUG_TAKEN", "Ya existe un producto con ese slug. Cámbialo e inténtalo de nuevo.")
		}
		return nil, apperr.Internal(err)
	}
	return s.GetProduct(ctx, p.ID)
}

func orDefault[T ~string](v, def T) T {
	if v == "" {
		return def
	}
	return v
}

func (s *AdminService) UpdateProduct(ctx context.Context, id uuid.UUID, in UpdateProductRequest) (*AdminProductResponse, error) {
	if aerr := s.refsExist(ctx, in.BrandID, in.CategoryID); aerr != nil {
		return nil, aerr
	}
	err := s.repo.UpdateProduct(ctx, id, func(p *models.Product, imageCount int) error {
		if in.BrandID != nil {
			p.BrandID = *in.BrandID
			p.Brand = nil
		}
		if in.CategoryID != nil {
			p.CategoryID = *in.CategoryID
			p.Category = nil
		}
		if in.Name != nil {
			p.Name = strings.TrimSpace(*in.Name)
		}
		if in.Slug != nil {
			slug, aerr := resolveSlug(*in.Slug, "", 180)
			if aerr != nil {
				return aerr
			}
			p.Slug = slug
		}
		if in.Colorway != nil {
			p.Colorway = strings.TrimSpace(*in.Colorway)
		}
		if in.Description != nil {
			p.Description = *in.Description
		}
		if in.Gender != nil {
			p.Gender = models.Gender(*in.Gender)
		}
		if in.Origin != nil {
			p.Origin = models.ProductOrigin(*in.Origin)
		}
		if in.BasePriceCOP != nil {
			p.BasePriceCOP = *in.BasePriceCOP
		}
		if in.CompareAtPriceCOP != nil {
			p.CompareAtPriceCOP = *in.CompareAtPriceCOP
		}
		if aerr := checkCompareAt(p.BasePriceCOP, p.CompareAtPriceCOP); aerr != nil {
			return aerr
		}
		if in.CostCOP != nil {
			p.CostCOP = *in.CostCOP
		}
		if in.IsNewRelease != nil {
			p.IsNewRelease = *in.IsNewRelease
		}
		if in.IsFeatured != nil {
			p.IsFeatured = *in.IsFeatured
		}
		if in.Status != nil {
			st := models.ProductStatus(*in.Status)
			switch st {
			case models.ProductDraft, models.ProductArchived:
			case models.ProductActive:
				// Regla de marca: solo se publica con las fotos mínimas (conteo dentro de la transacción).
				if aerr := needsImages(imageCount); aerr != nil {
					return aerr
				}
				if p.PublishedAt == nil {
					now := time.Now().UTC()
					p.PublishedAt = &now
				}
			default:
				return fieldErr("status", "Estado no permitido.")
			}
			p.Status = st
		}
		return nil
	})
	if err != nil {
		return nil, s.mapProductWriteErr(err)
	}
	return s.GetProduct(ctx, id)
}

// mapProductWriteErr deja pasar los *apperr.Error de las reglas y traduce los de base de datos.
func (s *AdminService) mapProductWriteErr(err error) error {
	if _, ok := apperr.As(err); ok {
		return err
	}
	switch {
	case errors.Is(err, errNotFound):
		return notFound("PRODUCT_NOT_FOUND", "No encontramos ese producto.")
	case errors.Is(err, errDuplicate):
		return conflict("SLUG_TAKEN", "Ya existe un producto con ese slug.")
	}
	return apperr.Internal(err)
}

// DeleteProduct solo borra borradores; lo publicado se archiva para no romper pedidos ni enlaces.
func (s *AdminService) DeleteProduct(ctx context.Context, id uuid.UUID) error {
	var files []string // fotos del producto: sus archivos se borran solo si el producto de verdad se eliminó
	if cur, gerr := s.GetProduct(ctx, id); gerr == nil {
		for _, im := range cur.Images {
			files = append(files, im.PublicID)
		}
	}
	err := s.repo.DeleteProduct(ctx, id, func(p *models.Product) error {
		if p.Status != models.ProductDraft {
			return conflict("PRODUCT_NOT_DRAFT", "Solo puedes eliminar borradores. Para retirar este producto de la tienda, archívalo.")
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errInUse) {
			return conflict("PRODUCT_IN_USE", "El producto está en uso. Archívalo en su lugar.")
		}
		return s.mapProductWriteErr(err)
	}
	if s.removeFile != nil {
		for _, f := range files {
			s.removeFile(f)
		}
	}
	return nil
}

// ======================= Fotos =======================

func checkHTTPS(field, raw string) *apperr.Error {
	if raw == "" {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return fieldErr(field, "La URL debe empezar por https://")
	}
	return nil
}

func (s *AdminService) AddImage(ctx context.Context, productID uuid.UUID, in AddImageRequest) (*AdminProductResponse, error) {
	publicID := strings.TrimSpace(in.PublicID)
	if wantID, local := storage.IsLocalURL(in.URL); local {
		// Foto subida desde el panel: la URL y el public_id deben corresponder, para no registrar un archivo ajeno.
		if publicID != wantID {
			return nil, fieldErr("public_id", "La foto no coincide con el archivo subido.")
		}
	} else if aerr := checkHTTPS("url", in.URL); aerr != nil {
		return nil, aerr
	}
	img := &models.ProductImage{PublicID: publicID, URL: in.URL, Alt: strings.TrimSpace(in.Alt)}
	if err := s.repo.AddImage(ctx, productID, img); err != nil {
		return nil, productErr(err)
	}
	return s.GetProduct(ctx, productID)
}

// DeleteImage impide dejar un producto publicado por debajo del mínimo de fotos.
func (s *AdminService) DeleteImage(ctx context.Context, productID, imageID uuid.UUID) (*AdminProductResponse, error) {
	var removed string
	if cur, gerr := s.GetProduct(ctx, productID); gerr == nil {
		for _, im := range cur.Images {
			if im.ID == imageID {
				removed = im.PublicID
			}
		}
	}
	err := s.repo.DeleteImage(ctx, productID, imageID, func(p *models.Product, remaining int) error {
		if p.Status == models.ProductActive {
			if aerr := needsImages(remaining); aerr != nil {
				return aerr
			}
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errNotFound) { // producto o foto
			return nil, notFound("IMAGE_NOT_FOUND", "No encontramos esa foto en el producto.")
		}
		return nil, s.mapProductWriteErr(err)
	}
	if removed != "" && s.removeFile != nil {
		s.removeFile(removed)
	}
	return s.GetProduct(ctx, productID)
}

func (s *AdminService) ReorderImages(ctx context.Context, productID uuid.UUID, in ReorderImagesRequest) (*AdminProductResponse, error) {
	if err := s.repo.ReorderImages(ctx, productID, in.ImageIDs); err != nil {
		if errors.Is(err, errImageMismatch) {
			return nil, fieldErr("image_ids", "Envía todas las fotos del producto, sin repetir ni agregar otras.")
		}
		return nil, productErr(err)
	}
	return s.GetProduct(ctx, productID)
}

// ======================= Variantes =======================

func normalizeSKU(raw string) (string, *apperr.Error) {
	sku := strings.ToUpper(strings.TrimSpace(raw))
	if !skuRe.MatchString(sku) {
		return "", fieldErr("sku", "Usa letras, números, punto, guion o guion bajo (ej. AJ4-WHT-42).")
	}
	return sku, nil
}

func variantDupErr() *apperr.Error {
	return conflict("VARIANT_EXISTS", "Ya existe una variante con ese SKU, o esa talla ya está creada en este producto.")
}

func (s *AdminService) CreateVariant(ctx context.Context, actor, productID uuid.UUID, in CreateVariantRequest) (*AdminProductResponse, error) {
	sku, aerr := normalizeSKU(in.SKU)
	if aerr != nil {
		return nil, aerr
	}
	v := &models.ProductVariant{
		SKU: sku, Size: strings.TrimSpace(in.Size),
		SizeSystem:  orDefault(models.SizeSystem(in.SizeSystem), models.SizeEU),
		StockOnHand: in.StockOnHand, SortOrder: in.SortOrder, Version: 1,
	}
	if in.PriceOverrideCOP != nil && *in.PriceOverrideCOP > 0 {
		v.PriceOverrideCOP = in.PriceOverrideCOP
	}
	if err := s.repo.CreateVariant(ctx, productID, v, actor); err != nil {
		if errors.Is(err, errDuplicate) {
			return nil, variantDupErr()
		}
		return nil, productErr(err)
	}
	return s.GetProduct(ctx, productID)
}

func (s *AdminService) UpdateVariant(ctx context.Context, actor, productID, variantID uuid.UUID, in UpdateVariantRequest) (*AdminProductResponse, error) {
	err := s.repo.UpdateVariant(ctx, productID, variantID, actor, func(v *models.ProductVariant) error {
		if in.SKU != nil {
			sku, aerr := normalizeSKU(*in.SKU)
			if aerr != nil {
				return aerr
			}
			v.SKU = sku
		}
		if in.Size != nil {
			v.Size = strings.TrimSpace(*in.Size)
		}
		if in.SizeSystem != nil {
			v.SizeSystem = models.SizeSystem(*in.SizeSystem)
		}
		if in.PriceOverrideCOP != nil {
			if *in.PriceOverrideCOP == 0 {
				v.PriceOverrideCOP = nil
			} else {
				v.PriceOverrideCOP = in.PriceOverrideCOP
			}
		}
		if in.StockOnHand != nil {
			if *in.StockOnHand < v.StockReserved {
				return fieldErr("stock_on_hand", "No puede ser menor que las unidades ya reservadas en pedidos.")
			}
			v.StockOnHand = *in.StockOnHand
		}
		if in.SortOrder != nil {
			v.SortOrder = *in.SortOrder
		}
		return nil
	})
	if err != nil {
		if _, ok := apperr.As(err); ok {
			return nil, err
		}
		switch {
		case errors.Is(err, errNotFound):
			return nil, notFound("VARIANT_NOT_FOUND", "No encontramos esa variante.")
		case errors.Is(err, errDuplicate):
			return nil, variantDupErr()
		}
		return nil, apperr.Internal(err)
	}
	return s.GetProduct(ctx, productID)
}

func (s *AdminService) DeleteVariant(ctx context.Context, productID, variantID uuid.UUID) (*AdminProductResponse, error) {
	if err := s.repo.DeleteVariant(ctx, productID, variantID); err != nil {
		switch {
		case errors.Is(err, errNotFound):
			return nil, notFound("VARIANT_NOT_FOUND", "No encontramos esa variante.")
		case errors.Is(err, errInUse):
			return nil, conflict("VARIANT_IN_USE", "La variante tiene pedidos asociados; pon su stock en 0 en lugar de eliminarla.")
		}
		return nil, apperr.Internal(err)
	}
	return s.GetProduct(ctx, productID)
}

// ======================= Mapeos =======================

func toAdminCategory(c *models.Category) AdminCategoryResponse {
	return AdminCategoryResponse{ID: c.ID, ParentID: c.ParentID, Name: c.Name, Slug: c.Slug,
		SortOrder: c.SortOrder, IsActive: c.IsActive, CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt}
}

func toAdminBrand(b *models.Brand) AdminBrandResponse {
	return AdminBrandResponse{ID: b.ID, Name: b.Name, Slug: b.Slug, LogoURL: b.LogoURL,
		IsActive: b.IsActive, CreatedAt: b.CreatedAt, UpdatedAt: b.UpdatedAt}
}

func toAdminProduct(p *models.Product, detail bool) AdminProductResponse {
	r := AdminProductResponse{
		ID: p.ID, Name: p.Name, Slug: p.Slug, Colorway: p.Colorway, Description: p.Description,
		Gender: p.Gender, Origin: p.Origin, Status: p.Status,
		BasePriceCOP: p.BasePriceCOP, CompareAtPriceCOP: p.CompareAtPriceCOP, CostCOP: p.CostCOP,
		IsNewRelease: p.IsNewRelease, IsFeatured: p.IsFeatured, PublishedAt: p.PublishedAt,
		ImageCount: len(p.Images), ImagesMissing: max(models.MinImagesToPublish-len(p.Images), 0),
		VariantCount: len(p.Variants), CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
	if p.Brand != nil {
		r.Brand = &AdminBrandRef{ID: p.Brand.ID, Name: p.Brand.Name, Slug: p.Brand.Slug}
	}
	if p.Category != nil {
		r.Category = &AdminCategoryRef{ID: p.Category.ID, Name: p.Category.Name, Slug: p.Category.Slug}
	}
	if !detail {
		return r
	}
	r.Images = make([]AdminImageResponse, 0, len(p.Images))
	for _, im := range p.Images {
		r.Images = append(r.Images, AdminImageResponse{ImageResponse: toImage(im), PublicID: im.PublicID})
	}
	r.Variants = make([]AdminVariantResponse, 0, len(p.Variants))
	for _, v := range p.Variants {
		r.Variants = append(r.Variants, AdminVariantResponse{
			ID: v.ID, SKU: v.SKU, Size: v.Size, SizeSystem: v.SizeSystem,
			PriceOverrideCOP: v.PriceOverrideCOP, PriceCOP: v.EffectivePriceCOP(*p),
			StockOnHand: v.StockOnHand, StockReserved: v.StockReserved, Available: max(v.Available(), 0),
			SortOrder: v.SortOrder,
		})
	}
	return r
}
