package home

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/domain/catalog"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

const contentKey = "home"

// ProductSource entrega los productos visibles de una sección (lo implementa catalog.Service).
type ProductSource interface {
	Select(ctx context.Context, sel catalog.Selection) ([]catalog.ProductSummary, error)
}

// Service lee y guarda la portada.
type Service struct {
	db       *gorm.DB
	products ProductSource
}

// NewService crea el servicio.
func NewService(db *gorm.DB, products ProductSource) *Service {
	return &Service{db: db, products: products}
}

// Get devuelve el documento guardado (o el de fábrica si aún no se ha editado).
func (s *Service) Get(ctx context.Context) (Content, error) {
	var row models.SiteContent
	err := s.db.WithContext(ctx).First(&row, "key = ?", contentKey).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Default(), nil
	}
	if err != nil {
		return Content{}, apperr.Internal(err)
	}
	var c Content
	if err := json.Unmarshal(row.Value, &c); err != nil {
		return Content{}, apperr.Internal(err)
	}
	c.Normalize()
	return c, nil
}

// Save valida todo el documento y lo guarda (todo o nada).
func (s *Service) Save(ctx context.Context, c Content) (Content, error) {
	c.Normalize()
	if d := c.Validate(); len(d) > 0 {
		return Content{}, apperr.New(apperr.KindValidation, "VALIDATION_ERROR", "Revisa los campos marcados.").WithDetails(d)
	}
	raw, err := json.Marshal(c)
	if err != nil {
		return Content{}, apperr.Internal(err)
	}
	row := models.SiteContent{Key: contentKey, Value: models.JSONB(raw), UpdatedAt: time.Now()}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "key"}}, DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&row).Error; err != nil {
		return Content{}, apperr.Internal(err)
	}
	return c, nil
}

// PublicSection es una sección con sus productos ya resueltos.
type PublicSection struct {
	Kind       string                   `json:"kind"`
	Title      string                   `json:"title"`
	Subtitle   string                   `json:"subtitle"`
	ViewAllURL string                   `json:"view_all_url"`
	Products   []catalog.ProductSummary `json:"products"`
}

// Public es lo que ve la tienda: solo lo activo, y sin secciones vacías.
type Public struct {
	Announcement *Announcement   `json:"announcement"`
	Hero         *Hero           `json:"hero"`
	Banners      []Tile          `json:"banners"`
	Sections     []PublicSection `json:"sections"`
	Categories   *Tiles          `json:"categories"`
}

// Public arma la portada pública resolviendo los productos de cada sección.
func (s *Service) Public(ctx context.Context) (*Public, error) {
	c, err := s.Get(ctx)
	if err != nil {
		return nil, err
	}
	out := &Public{Banners: c.Banners, Sections: []PublicSection{}}
	if c.Announcement.Enabled && c.Announcement.Text != "" {
		out.Announcement = &c.Announcement
	}
	if c.Hero.Enabled {
		out.Hero = &c.Hero
	}
	if c.Categories.Enabled && len(c.Categories.Items) > 0 {
		out.Categories = &c.Categories
	}
	for _, sec := range c.Sections {
		if !sec.Enabled {
			continue
		}
		items, err := s.products.Select(ctx, catalog.Selection{Kind: sec.Kind, Slugs: sec.ProductSlugs, Limit: sec.Limit})
		if err != nil {
			return nil, err
		}
		if sec.Kind == KindPicked && len(items) > sec.Limit {
			items = items[:sec.Limit]
		}
		if len(items) == 0 {
			continue // una fila vacía no se muestra
		}
		out.Sections = append(out.Sections, PublicSection{
			Kind: sec.Kind, Title: sec.Title, Subtitle: sec.Subtitle, ViewAllURL: sec.ViewAllURL, Products: items,
		})
	}
	return out, nil
}
