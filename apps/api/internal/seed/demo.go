package seed

import (
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/juancamiloparra/starboy-api/internal/domain/inventory"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

// Productos de demostración SOLO para desarrollo: permiten recorrer la tienda sin cargar el catálogo a mano.
// Las fotos son ilustraciones en apps/web/public/demo/<slug>-1..4.svg (las genera apps/web/scripts/gen_demo_images.py).
// Es idempotente: un producto que ya existe (por slug) no se toca. Para quitarlos: DELETE de los slugs con prefijo "demo-".

type demoVariant struct {
	Size  string
	Stock int
}

type demoProduct struct {
	Slug, Name, Colorway, Description string
	Brand, Category                   string
	Gender                            models.Gender
	Origin                            models.ProductOrigin
	Price, CompareAt                  int64
	New, Featured                     bool
	System                            models.SizeSystem
	Variants                          []demoVariant
}

var (
	shoeSizes   = []string{"38", "39", "40", "41", "42", "43", "44"}
	apparelSize = []string{"XS", "S", "M", "L", "XL"}
)

func stock(sizes []string, counts ...int) []demoVariant {
	out := make([]demoVariant, len(sizes))
	for i, s := range sizes {
		out[i] = demoVariant{Size: s, Stock: counts[i%len(counts)]}
	}
	return out
}

var demoProducts = []demoProduct{
	{Slug: "demo-jordan-4-retro-white-oreo", Name: "Jordan 4 Retro", Colorway: "White Oreo", Brand: "jordan", Category: "sneakers",
		Gender: models.GenderUnisex, Price: 1249900, New: true, Featured: true, System: models.SizeEU,
		Description: "Silueta clásica de 1989 con paneles de malla, cámara de aire visible y detalles en gris. Edición de colección, 100 % original.",
		Variants:    stock(shoeSizes, 4, 3, 0, 2, 5, 1, 2)},
	{Slug: "demo-nike-dunk-low-panda", Name: "Nike Dunk Low", Colorway: "Panda", Brand: "nike", Category: "sneakers",
		Gender: models.GenderUnisex, Price: 579900, CompareAt: 699900, Featured: true, System: models.SizeEU,
		Description: "Cuero blanco y negro, suela de goma y el calce de básquet de los 80. Va con todo.",
		Variants:    stock(shoeSizes, 6, 4, 8, 3, 0, 2, 5)},
	{Slug: "demo-nike-air-force-1-triple-white", Name: "Nike Air Force 1 '07", Colorway: "Triple White", Brand: "nike", Category: "sneakers",
		Gender: models.GenderMen, Price: 459900, System: models.SizeEU,
		Description: "El par blanco de todos los días: cuero liso, cámara Air y suela de cupsole.",
		Variants:    stock(shoeSizes, 10, 8, 12, 9, 7, 6, 3)},
	{Slug: "demo-new-balance-550-white-green", Name: "New Balance 550", Colorway: "White Green", Brand: "new-balance", Category: "sneakers",
		Gender: models.GenderUnisex, Price: 529900, New: true, System: models.SizeEU,
		Description: "Inspirada en el básquet de finales de los 80, con cuero y detalles verdes.",
		Variants:    stock(shoeSizes, 2, 5, 3, 0, 4, 2, 1)},
	{Slug: "demo-adidas-samba-og", Name: "Adidas Samba OG", Colorway: "Core Black", Brand: "adidas", Category: "sneakers",
		Gender: models.GenderWomen, Price: 479900, CompareAt: 599900, System: models.SizeEU,
		Description: "Ícono del fútbol sala hecho calle: cuero, ante en la puntera y suela de goma natural.",
		Variants:    stock(shoeSizes[:5], 4, 6, 5, 3, 2)},
	{Slug: "demo-adidas-gazelle-bold", Name: "Adidas Gazelle Bold", Colorway: "Pink Glow", Brand: "adidas", Category: "sneakers",
		Gender: models.GenderWomen, Price: 449900, New: true, System: models.SizeEU,
		Description: "Plataforma gruesa y ante suave. Agotada: vuelve pronto.",
		Variants:    stock(shoeSizes[:5], 0)},
	{Slug: "demo-nike-air-max-90", Name: "Nike Air Max 90", Colorway: "Infrared", Brand: "nike", Category: "sneakers",
		Gender: models.GenderMen, Origin: models.OriginImportedStock, Price: 649900, System: models.SizeEU,
		Description: "Stock en Colombia traído desde USA. Cámara Air visible y el degradado de siempre.",
		Variants:    stock(shoeSizes[2:], 2, 1, 3, 2, 1)},
	{Slug: "demo-jordan-1-low", Name: "Jordan 1 Low", Colorway: "Sail Pink", Brand: "jordan", Category: "sneakers",
		Gender: models.GenderWomen, Price: 499900, System: models.SizeEU,
		Description: "La Jordan 1 en versión baja, con cuero suave y suela de goma.",
		Variants:    stock(shoeSizes[:5], 3, 4, 5, 2, 1)},
	{Slug: "demo-nike-victori-one-slide", Name: "Nike Victori One", Colorway: "Black White", Brand: "nike", Category: "sandalias",
		Gender: models.GenderUnisex, Price: 159900, System: models.SizeEU,
		Description: "Chancla con espuma ultra suave y banda ancha. Para después del partido.",
		Variants:    stock(shoeSizes, 8, 10, 6, 7, 9, 5, 4)},
	{Slug: "demo-essentials-hoodie-negro", Name: "Essentials Hoodie", Colorway: "Negro", Brand: "essentials", Category: "hoodies",
		Gender: models.GenderUnisex, Price: 289900, CompareAt: 349900, Featured: true, System: models.SizeAlpha,
		Description: "Algodón felpado pesado, capota doble y bolsillo canguro. Corte oversize.",
		Variants:    stock(apparelSize, 5, 8, 10, 6, 3)},
	{Slug: "demo-nike-sportswear-tee", Name: "Nike Sportswear Tee", Colorway: "Blanco", Brand: "nike", Category: "camisetas",
		Gender: models.GenderMen, Price: 119900, System: models.SizeAlpha,
		Description: "Camiseta de algodón con logo bordado. Corte regular.",
		Variants:    stock(apparelSize, 10, 12, 15, 9, 4)},
	{Slug: "demo-essentials-boxy-tee-crema", Name: "Essentials Boxy Tee", Colorway: "Crema", Brand: "essentials", Category: "camisetas",
		Gender: models.GenderWomen, Price: 99900, New: true, System: models.SizeAlpha,
		Description: "Corte boxy y cuello grueso. Algodón de 220 g.",
		Variants:    stock(apparelSize, 6, 7, 5, 4, 2)},
	{Slug: "demo-essentials-cargo-pant", Name: "Essentials Cargo Pant", Colorway: "Verde Militar", Brand: "essentials", Category: "pantalones",
		Gender: models.GenderMen, Price: 259900, System: models.SizeAlpha,
		Description: "Pantalón cargo de sarga con bolsillos laterales y ajuste en el tobillo.",
		Variants:    stock(apparelSize, 3, 5, 6, 4, 1)},
	{Slug: "demo-jordan-windrunner-jacket", Name: "Jordan Windrunner", Colorway: "Negro Rojo", Brand: "jordan", Category: "chaquetas",
		Gender: models.GenderMen, Price: 399900, CompareAt: 499900, System: models.SizeAlpha,
		Description: "Cortavientos ligero con capota y cierre completo.",
		Variants:    stock(apparelSize, 2, 3, 4, 2, 1)},
	{Slug: "demo-jordan-pro-cap", Name: "Jordan Pro Cap", Colorway: "Negro", Brand: "jordan", Category: "gorras",
		Gender: models.GenderUnisex, Price: 129900, System: models.SizeOne,
		Description: "Gorra curva ajustable con logo Jumpman bordado.",
		Variants:    []demoVariant{{Size: "Única", Stock: 12}}},
	{Slug: "demo-nike-everyday-socks", Name: "Nike Everyday x3", Colorway: "Blanco", Brand: "nike", Category: "medias",
		Gender: models.GenderUnisex, Price: 59900, System: models.SizeOne,
		Description: "Pack de tres pares con acolchado en planta y soporte en el arco.",
		Variants:    []demoVariant{{Size: "Única", Stock: 30}}},
	{Slug: "demo-nike-heritage-bag", Name: "Nike Heritage Bag", Colorway: "Negro", Brand: "nike", Category: "bolsos",
		Gender: models.GenderUnisex, Price: 149900, System: models.SizeOne,
		Description: "Bolso cruzado con bolsillo frontal y correa ajustable.",
		Variants:    []demoVariant{{Size: "Única", Stock: 9}}},
}

// RunDemo carga los productos de demostración. Rechaza correr en producción.
func RunDemo(db *gorm.DB, production bool) error {
	if production {
		return fmt.Errorf("los productos de demostración no se cargan en producción")
	}
	return db.Transaction(func(tx *gorm.DB) error {
		created := 0
		for _, d := range demoProducts {
			var n int64
			if err := tx.Model(&models.Product{}).Where("slug = ?", d.Slug).Count(&n).Error; err != nil {
				return err
			}
			if n > 0 {
				continue
			}
			var brand models.Brand
			if err := tx.Where("slug = ?", d.Brand).First(&brand).Error; err != nil {
				return fmt.Errorf("marca %q (¿corriste -seed?): %w", d.Brand, err)
			}
			var cat models.Category
			if err := tx.Where("slug = ?", d.Category).First(&cat).Error; err != nil {
				return fmt.Errorf("categoría %q (¿corriste -seed?): %w", d.Category, err)
			}
			now := time.Now().UTC()
			origin := d.Origin
			if origin == "" {
				origin = models.OriginLocal
			}
			p := models.Product{
				BrandID: brand.ID, CategoryID: cat.ID, Name: d.Name, Slug: d.Slug, Colorway: d.Colorway,
				Description: d.Description, Gender: d.Gender, Origin: origin, Status: models.ProductActive,
				BasePriceCOP: d.Price, CompareAtPriceCOP: d.CompareAt, IsNewRelease: d.New, IsFeatured: d.Featured,
				PublishedAt: &now,
			}
			views := []string{"lateral", "superior", "trasera", "detalle"}
			for i, v := range views {
				p.Images = append(p.Images, models.ProductImage{
					PublicID: fmt.Sprintf("demo/%s-%d", d.Slug, i+1), URL: fmt.Sprintf("/demo/%s-%d.svg", d.Slug, i+1),
					Alt: fmt.Sprintf("%s %s, vista %s", d.Name, d.Colorway, v), Position: i,
				})
			}
			for i, v := range d.Variants {
				p.Variants = append(p.Variants, models.ProductVariant{
					SKU: fmt.Sprintf("%s-%s", skuBase(d.Slug), v.Size), Size: v.Size, SizeSystem: d.System,
					StockOnHand: v.Stock, SortOrder: i, Version: 1,
				})
			}
			if err := tx.Create(&p).Error; err != nil {
				return fmt.Errorf("producto %s: %w", d.Slug, err)
			}
			for i := range p.Variants {
				if err := inventory.LogAdjustment(tx, &p.Variants[i], p.Variants[i].StockOnHand,
					inventory.Meta{Reason: "Stock inicial (datos de demostración)"}); err != nil {
					return err
				}
			}
			created++
		}
		fmt.Printf("productos de demostración creados: %d (ya existían: %d)\n", created, len(demoProducts)-created)
		return nil
	})
}

// skuBase: "demo-jordan-4-retro-white-oreo" -> "DEMO-JORDAN-4-RETRO-WHITE-OREO" (único por producto).
func skuBase(slug string) string {
	out := make([]byte, len(slug))
	for i := 0; i < len(slug); i++ {
		c := slug[i]
		if c >= 'a' && c <= 'z' {
			c -= 32
		}
		out[i] = c
	}
	return string(out)
}
