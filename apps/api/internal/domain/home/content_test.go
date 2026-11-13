package home

import "testing"

func TestDefaultIsValid(t *testing.T) {
	c := Default()
	c.Normalize()
	if d := c.Validate(); len(d) != 0 {
		t.Fatalf("la portada de fábrica debe ser válida: %v", d)
	}
}

func TestValidate(t *testing.T) {
	cases := map[string]struct {
		edit func(*Content)
		key  string // campo que debe fallar; "" = válido
	}{
		"aviso activo sin texto": {func(c *Content) { c.Announcement = Announcement{Enabled: true} }, "announcement.text"},
		"enlace javascript":      {func(c *Content) { c.Hero.PrimaryURL = "javascript:alert(1)" }, "hero.primary_url"},
		"enlace a otro host //":  {func(c *Content) { c.Hero.PrimaryURL = "//evil.com" }, "hero.primary_url"},
		"enlace http inseguro":   {func(c *Content) { c.Hero.PrimaryURL = "http://x.com" }, "hero.primary_url"},
		"enlace https ok":        {func(c *Content) { c.Hero.PrimaryURL = "https://instagram.com/starboy" }, ""},
		"botón sin enlace":       {func(c *Content) { c.Hero.SecondaryURL = "" }, "hero.secondary_label"},
		"banner sin foto":        {func(c *Content) { c.Banners = []Tile{{Title: "x"}} }, "banners.0.image_url"},
		"banner con foto subida": {func(c *Content) { c.Banners = []Tile{{ImageURL: "/uploads/local/a.jpg"}} }, ""},
		"demasiados banners":     {func(c *Content) { c.Banners = make([]Tile, 4) }, "banners"},
		"categoría sin título":   {func(c *Content) { c.Categories.Items = []Tile{{ImageURL: "/uploads/a.jpg"}} }, "categories.items.0.title"},
		"sección tipo inválido":  {func(c *Content) { c.Sections[0].Kind = "X" }, "sections.0.kind"},
		"sección límite fuera":   {func(c *Content) { c.Sections[0].Limit = 99 }, "sections.0.limit"},
		"seleccionados repetidos": {func(c *Content) {
			c.Sections = []Section{{Kind: KindPicked, Title: "a", Limit: 4, ProductSlugs: []string{"a", "a"}}}
		}, "sections.0.product_slugs"},
		"título muy largo": {func(c *Content) { c.Hero.Title = string(make([]rune, 81)) + "x" }, "hero.title"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			c := Default()
			tc.edit(&c)
			c.Normalize()
			d := c.Validate()
			if tc.key == "" && len(d) != 0 {
				t.Fatalf("debía ser válido: %v", d)
			}
			if tc.key != "" {
				if _, ok := d[tc.key]; !ok {
					t.Fatalf("debía fallar %q; errores: %v", tc.key, d)
				}
			}
		})
	}
}
