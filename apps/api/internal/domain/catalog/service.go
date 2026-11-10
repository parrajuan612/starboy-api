package catalog

import (
	"context"
	"errors"
	"strings"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

var errProductNotFound = apperr.New(apperr.KindNotFound, "PRODUCT_NOT_FOUND", "No encontramos ese producto.")

// Service contiene las reglas del catálogo público.
type Service struct{ repo Repository }

// NewService crea el servicio.
func NewService(repo Repository) *Service { return &Service{repo: repo} }

// ListProducts devuelve una página de productos visibles.
func (s *Service) ListProducts(ctx context.Context, q ListQuery) ([]ProductSummary, response.Meta, error) {
	if q.MinPrice != nil && q.MaxPrice != nil && *q.MinPrice > *q.MaxPrice {
		return nil, response.Meta{}, apperr.New(apperr.KindValidation, "VALIDATION_ERROR", "Revisa los datos que enviaste.").
			WithDetails(map[string]string{"min_price": "No puede ser mayor que el precio máximo."})
	}
	page, limit := q.Page, q.Limit
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	items, total, err := s.repo.ListProducts(ctx, ProductFilter{
		Gender:       q.Gender,
		CategorySlug: strings.ToLower(strings.TrimSpace(q.Category)),
		BrandSlug:    strings.ToLower(strings.TrimSpace(q.Brand)),
		Origin:       q.Origin,
		Search:       strings.TrimSpace(q.Q),
		MinPrice:     q.MinPrice,
		MaxPrice:     q.MaxPrice,
		Sort:         SortOrder(q.Sort),
		Offset:       (page - 1) * limit,
		Limit:        limit,
	})
	if err != nil {
		return nil, response.Meta{}, apperr.Internal(err)
	}
	out := make([]ProductSummary, 0, len(items))
	for i := range items {
		out = append(out, toSummary(&items[i]))
	}
	return out, response.NewMeta(page, limit, total), nil
}

// GetProduct devuelve la ficha por slug (variantes y fotos ya ordenadas).
func (s *Service) GetProduct(ctx context.Context, slug string) (*ProductDetail, error) {
	p, err := s.repo.FindProductBySlug(ctx, strings.ToLower(strings.TrimSpace(slug)))
	if err != nil {
		if errors.Is(err, errNotFound) {
			return nil, errProductNotFound
		}
		return nil, apperr.Internal(err)
	}
	d := &ProductDetail{
		ProductSummary: toSummary(p),
		Description:    p.Description,
		Images:         make([]ImageResponse, 0, len(p.Images)),
		Variants:       make([]VariantResponse, 0, len(p.Variants)),
	}
	if p.Category != nil {
		d.Category = &CategoryRef{Name: p.Category.Name, Slug: p.Category.Slug}
	}
	for _, im := range p.Images {
		d.Images = append(d.Images, toImage(im))
	}
	for _, v := range p.Variants {
		avail := max(v.Available(), 0)
		d.Variants = append(d.Variants, VariantResponse{
			ID: v.ID, SKU: v.SKU, Size: v.Size, SizeSystem: v.SizeSystem,
			PriceCOP: v.EffectivePriceCOP(*p), Available: avail, InStock: avail > 0,
		})
	}
	return d, nil
}

// ListCategories devuelve el árbol activo (raíces con hijos).
func (s *Service) ListCategories(ctx context.Context) ([]CategoryResponse, error) {
	all, err := s.repo.ListCategories(ctx)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	roots := []CategoryResponse{}
	byParent := map[string][]CategoryResponse{}
	for _, c := range all {
		node := CategoryResponse{ID: c.ID, Name: c.Name, Slug: c.Slug, SortOrder: c.SortOrder, Children: []CategoryResponse{}}
		if c.ParentID == nil {
			roots = append(roots, node)
		} else {
			byParent[c.ParentID.String()] = append(byParent[c.ParentID.String()], node)
		}
	}
	for i := range roots {
		if kids, ok := byParent[roots[i].ID.String()]; ok {
			roots[i].Children = kids
		}
	}
	return roots, nil
}

// ListBrands devuelve las marcas activas.
func (s *Service) ListBrands(ctx context.Context) ([]BrandResponse, error) {
	bs, err := s.repo.ListBrands(ctx)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	out := make([]BrandResponse, 0, len(bs))
	for _, b := range bs {
		out = append(out, BrandResponse{ID: b.ID, Name: b.Name, Slug: b.Slug, LogoURL: b.LogoURL})
	}
	return out, nil
}

func toSummary(p *models.Product) ProductSummary {
	s := ProductSummary{
		ID: p.ID, Slug: p.Slug, Name: p.Name, Colorway: p.Colorway,
		Gender: p.Gender, Origin: p.Origin,
		BasePriceCOP: p.BasePriceCOP, CompareAtPriceCOP: p.CompareAtPriceCOP,
		DiscountPercent: p.DiscountPercent(),
		IsNewRelease:    p.IsNewRelease, IsFeatured: p.IsFeatured,
	}
	if p.Brand != nil {
		s.Brand = &BrandRef{Name: p.Brand.Name, Slug: p.Brand.Slug}
	}
	if len(p.Images) > 0 {
		im := toImage(p.Images[0])
		s.Image = &im
	}
	if len(p.Images) > 1 {
		hv := toImage(p.Images[1])
		s.HoverImage = &hv
	}
	for _, v := range p.Variants {
		if v.Available() > 0 {
			s.InStock = true
			break
		}
	}
	return s
}

func toImage(i models.ProductImage) ImageResponse {
	return ImageResponse{ID: i.ID, URL: i.URL, Alt: i.Alt, Position: i.Position}
}
