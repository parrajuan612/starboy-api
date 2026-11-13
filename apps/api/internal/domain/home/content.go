// Package home es el contenido editable de la portada de la tienda (banner, anuncios, secciones de
// productos y categorías con foto). Se guarda como un solo documento y se valida entero antes de guardar.
package home

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// Tipos de sección de productos.
const (
	KindNew      = "NEW_RELEASES" // se llena sola con los productos marcados «Nuevo lanzamiento»
	KindFeatured = "FEATURED"     // ídem con «Destacado»
	KindOnSale   = "ON_SALE"      // productos con precio de lista mayor al precio de venta
	KindPicked   = "PICKED"       // los productos que se elijan a mano
)

// Límites: acotan el documento y lo que pinta la portada.
const (
	MaxBanners    = 3
	MaxTiles      = 6
	MaxSections   = 6
	MaxPicked     = 12
	MinLimit      = 2
	MaxLimit      = 12
	maxURLLen     = 500
	maxAnnounceLn = 140
)

// Announcement es la franja de aviso sobre el encabezado.
type Announcement struct {
	Enabled bool   `json:"enabled"`
	Text    string `json:"text"`
	URL     string `json:"url"`
}

// Hero es el banner principal.
type Hero struct {
	Enabled        bool   `json:"enabled"`
	Eyebrow        string `json:"eyebrow"`
	Title          string `json:"title"`
	Subtitle       string `json:"subtitle"`
	ImageURL       string `json:"image_url"`
	PrimaryLabel   string `json:"primary_label"`
	PrimaryURL     string `json:"primary_url"`
	SecondaryLabel string `json:"secondary_label"`
	SecondaryURL   string `json:"secondary_url"`
}

// Tile es una tarjeta con foto: banner promocional o categoría destacada.
type Tile struct {
	ImageURL string `json:"image_url"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	Label    string `json:"label"` // texto del botón
	URL      string `json:"url"`
}

// Section es una fila de productos.
type Section struct {
	Kind         string   `json:"kind"`
	Enabled      bool     `json:"enabled"`
	Title        string   `json:"title"`
	Subtitle     string   `json:"subtitle"`
	Limit        int      `json:"limit"`
	ProductSlugs []string `json:"product_slugs"` // solo en PICKED
	ViewAllURL   string   `json:"view_all_url"`
}

// Tiles es un bloque de tarjetas con título (categorías destacadas).
type Tiles struct {
	Enabled bool   `json:"enabled"`
	Title   string `json:"title"`
	Items   []Tile `json:"items"`
}

// Content es el documento completo de la portada.
type Content struct {
	Announcement Announcement `json:"announcement"`
	Hero         Hero         `json:"hero"`
	Banners      []Tile       `json:"banners"`
	Sections     []Section    `json:"sections"`
	Categories   Tiles        `json:"categories"`
}

// Default es la portada de una tienda recién instalada.
func Default() Content {
	return Content{
		Announcement: Announcement{Text: "Envíos a todo Colombia"},
		Hero: Hero{
			Enabled: true, Eyebrow: "Nueva temporada", Title: "New season",
			Subtitle:     "Sneakers y streetwear para Colombia. Compra del catálogo local o encarga desde USA.",
			PrimaryLabel: "Ver novedades", PrimaryURL: "/nuevos",
			SecondaryLabel: "Encargos USA", SecondaryURL: "/encargos-usa",
		},
		Banners: []Tile{},
		Sections: []Section{
			{Kind: KindNew, Enabled: true, Title: "Nuevos lanzamientos", Limit: 8, ProductSlugs: []string{}, ViewAllURL: "/nuevos"},
			{Kind: KindFeatured, Enabled: true, Title: "Destacados", Limit: 8, ProductSlugs: []string{}},
		},
		Categories: Tiles{Title: "Compra por categoría", Items: []Tile{}},
	}
}

// Normalize recorta textos y reemplaza listas nulas por vacías.
func (c *Content) Normalize() {
	t := strings.TrimSpace
	a := &c.Announcement
	a.Text, a.URL = t(a.Text), t(a.URL)
	h := &c.Hero
	h.Eyebrow, h.Title, h.Subtitle, h.ImageURL = t(h.Eyebrow), t(h.Title), t(h.Subtitle), t(h.ImageURL)
	h.PrimaryLabel, h.PrimaryURL, h.SecondaryLabel, h.SecondaryURL = t(h.PrimaryLabel), t(h.PrimaryURL), t(h.SecondaryLabel), t(h.SecondaryURL)
	tile := func(x *Tile) {
		x.ImageURL, x.Title, x.Subtitle, x.Label, x.URL = t(x.ImageURL), t(x.Title), t(x.Subtitle), t(x.Label), t(x.URL)
	}
	if c.Banners == nil {
		c.Banners = []Tile{}
	}
	for i := range c.Banners {
		tile(&c.Banners[i])
	}
	if c.Categories.Items == nil {
		c.Categories.Items = []Tile{}
	}
	c.Categories.Title = t(c.Categories.Title)
	for i := range c.Categories.Items {
		tile(&c.Categories.Items[i])
	}
	if c.Sections == nil {
		c.Sections = []Section{}
	}
	for i := range c.Sections {
		s := &c.Sections[i]
		s.Title, s.Subtitle, s.ViewAllURL = t(s.Title), t(s.Subtitle), t(s.ViewAllURL)
		if s.Kind != KindPicked || s.ProductSlugs == nil {
			s.ProductSlugs = []string{}
		}
	}
}

// Validate devuelve los errores por campo (clave con ruta, ej. «banners.0.image_url»); vacío = válido.
func (c *Content) Validate() map[string]string {
	e := map[string]string{}
	text := func(key, v string, max int, required bool) {
		switch {
		case required && v == "":
			e[key] = "Escríbelo."
		case utf8.RuneCountInString(v) > max:
			e[key] = fmt.Sprintf("Máximo %d caracteres.", max)
		}
	}
	link := func(key, v string) {
		if v != "" && !validLink(v) {
			e[key] = "Usa una ruta de la tienda (/nuevos) o una dirección que empiece por https://."
		}
	}
	image := func(key, v string, required bool) {
		switch {
		case v == "" && required:
			e[key] = "Sube una foto."
		case v != "" && !validLink(v):
			e[key] = "La foto no es válida: súbela de nuevo."
		}
	}

	a := c.Announcement
	text("announcement.text", a.Text, maxAnnounceLn, a.Enabled)
	link("announcement.url", a.URL)

	h := c.Hero
	text("hero.eyebrow", h.Eyebrow, 40, false)
	text("hero.title", h.Title, 80, h.Enabled)
	text("hero.subtitle", h.Subtitle, 220, false)
	image("hero.image_url", h.ImageURL, false)
	text("hero.primary_label", h.PrimaryLabel, 30, false)
	text("hero.secondary_label", h.SecondaryLabel, 30, false)
	link("hero.primary_url", h.PrimaryURL)
	link("hero.secondary_url", h.SecondaryURL)
	if (h.PrimaryLabel == "") != (h.PrimaryURL == "") {
		e["hero.primary_label"] = "El botón necesita texto y enlace."
	}
	if (h.SecondaryLabel == "") != (h.SecondaryURL == "") {
		e["hero.secondary_label"] = "El botón necesita texto y enlace."
	}

	tiles := func(prefix string, list []Tile, max int, titleRequired bool) {
		if len(list) > max {
			e[prefix] = fmt.Sprintf("Máximo %d.", max)
			return
		}
		for i, t := range list {
			k := fmt.Sprintf("%s.%d.", prefix, i)
			image(k+"image_url", t.ImageURL, true)
			text(k+"title", t.Title, 60, titleRequired)
			text(k+"subtitle", t.Subtitle, 120, false)
			text(k+"label", t.Label, 30, false)
			link(k+"url", t.URL)
		}
	}
	tiles("banners", c.Banners, MaxBanners, false)
	text("categories.title", c.Categories.Title, 60, false)
	tiles("categories.items", c.Categories.Items, MaxTiles, true)

	if len(c.Sections) > MaxSections {
		e["sections"] = fmt.Sprintf("Máximo %d secciones.", MaxSections)
		return e
	}
	for i, s := range c.Sections {
		k := fmt.Sprintf("sections.%d.", i)
		switch s.Kind {
		case KindNew, KindFeatured, KindOnSale, KindPicked:
		default:
			e[k+"kind"] = "Tipo de sección no válido."
		}
		text(k+"title", s.Title, 60, true)
		text(k+"subtitle", s.Subtitle, 120, false)
		link(k+"view_all_url", s.ViewAllURL)
		if s.Limit < MinLimit || s.Limit > MaxLimit {
			e[k+"limit"] = fmt.Sprintf("Entre %d y %d productos.", MinLimit, MaxLimit)
		}
		if s.Kind == KindPicked {
			if len(s.ProductSlugs) > MaxPicked {
				e[k+"product_slugs"] = fmt.Sprintf("Máximo %d productos.", MaxPicked)
			}
			seen := map[string]bool{}
			for _, sl := range s.ProductSlugs {
				if sl == "" || len(sl) > 100 || seen[sl] {
					e[k+"product_slugs"] = "La lista de productos no es válida."
					break
				}
				seen[sl] = true
			}
		}
	}
	return e
}

// validLink admite rutas de la tienda («/nuevos») y direcciones https; nada de «javascript:» ni «//host».
func validLink(v string) bool {
	if len(v) > maxURLLen || strings.ContainsAny(v, " \t\r\n\\<>\"") {
		return false
	}
	switch {
	case strings.HasPrefix(v, "//"):
		return false
	case strings.HasPrefix(v, "/"):
		return true
	default:
		return strings.HasPrefix(v, "https://") && len(v) > len("https://")
	}
}
