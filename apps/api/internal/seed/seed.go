// Package seed carga los datos iniciales de forma idempotente (SSD §9.4).
// Se puede correr cuantas veces se quiera: no duplica ni pisa datos editados desde el admin.
package seed

import (
	"errors"
	"fmt"
	"log"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/juancamiloparra/starboy-api/internal/config"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

const bcryptCost = 12

// Run ejecuta todo el seed dentro de una transacción.
func Run(db *gorm.DB, cfg config.Seed) error {
	return db.Transaction(func(tx *gorm.DB) error {
		if err := seedAdmin(tx, cfg); err != nil {
			return fmt.Errorf("admin: %w", err)
		}
		if err := seedCategories(tx); err != nil {
			return fmt.Errorf("categorías: %w", err)
		}
		if err := seedBrands(tx); err != nil {
			return fmt.Errorf("marcas: %w", err)
		}
		if err := seedSettings(tx); err != nil {
			return fmt.Errorf("ajustes: %w", err)
		}
		if err := seedImportRates(tx); err != nil {
			return fmt.Errorf("tarifas de encargo: %w", err)
		}
		return nil
	})
}

func seedAdmin(tx *gorm.DB, cfg config.Seed) error {
	if cfg.AdminEmail == "" || cfg.AdminPassword == "" {
		return errors.New("SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD son obligatorios para el seed")
	}
	// BeforeSave normaliza el email al guardar; se normaliza igual para buscar.
	probe := models.User{Email: cfg.AdminEmail}
	_ = probe.BeforeSave(nil)

	var count int64
	if err := tx.Model(&models.User{}).Where("email = ?", probe.Email).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		log.Printf("seed: admin %s ya existe, se conserva", probe.Email)
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPassword), bcryptCost)
	if err != nil {
		return err
	}
	admin := models.User{
		Email:        probe.Email,
		PasswordHash: string(hash),
		FullName:     cfg.AdminName,
		Role:         models.RoleAdmin,
		IsActive:     true,
	}
	if err := tx.Create(&admin).Error; err != nil {
		return err
	}
	log.Printf("seed: admin %s creado", admin.Email)
	return nil
}

type categorySeed struct {
	Name, Slug string
	Children   []categorySeed
}

var categoryTree = []categorySeed{
	{Name: "Zapatos", Slug: "zapatos", Children: []categorySeed{
		{Name: "Sneakers", Slug: "sneakers"},
		{Name: "Botas", Slug: "botas"},
		{Name: "Sandalias", Slug: "sandalias"},
	}},
	{Name: "Ropa", Slug: "ropa", Children: []categorySeed{
		{Name: "Camisetas", Slug: "camisetas"},
		{Name: "Hoodies", Slug: "hoodies"},
		{Name: "Pantalones", Slug: "pantalones"},
		{Name: "Chaquetas", Slug: "chaquetas"},
	}},
	{Name: "Accesorios", Slug: "accesorios", Children: []categorySeed{
		{Name: "Gorras", Slug: "gorras"},
		{Name: "Medias", Slug: "medias"},
		{Name: "Bolsos", Slug: "bolsos"},
	}},
}

func seedCategories(tx *gorm.DB) error {
	for i, parent := range categoryTree {
		p := models.Category{Name: parent.Name, Slug: parent.Slug, SortOrder: i, IsActive: true}
		if err := tx.Where(models.Category{Slug: parent.Slug}).FirstOrCreate(&p).Error; err != nil {
			return err
		}
		for j, child := range parent.Children {
			c := models.Category{ParentID: &p.ID, Name: child.Name, Slug: child.Slug, SortOrder: j, IsActive: true}
			if err := tx.Where(models.Category{Slug: child.Slug}).FirstOrCreate(&c).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

var brandSeeds = []models.Brand{
	{Name: "Nike", Slug: "nike"},
	{Name: "Jordan", Slug: "jordan"},
	{Name: "Adidas", Slug: "adidas"},
	{Name: "New Balance", Slug: "new-balance"},
	{Name: "Essentials", Slug: "essentials"},
}

func seedBrands(tx *gorm.DB) error {
	for _, b := range brandSeeds {
		b.IsActive = true
		if err := tx.Where(models.Brand{Slug: b.Slug}).FirstOrCreate(&b).Error; err != nil {
			return err
		}
	}
	return nil
}

type settingSeed struct {
	Key, Value, Description string
}

var settingSeeds = []settingSeed{
	{models.SettingExchangeRateCOP, "4200", "TRM Starboy (pesos por USD, entero)"},
	{models.SettingTaxExemptThresholdUSD, "200", "Umbral sin impuestos en USD (cambiar a 50 si aduanas lo confirma)"},
	{models.SettingTariffPercent, "10", "Arancel (%) si se supera el umbral"},
	{models.SettingVATPercent, "19", "IVA (%) si se supera el umbral"},
	{models.SettingServiceFeePercent, "12", "Comisión de servicio (%)"},
	{models.SettingServiceFeeMinCOP, "35000", "Comisión mínima en COP"},
	{models.SettingDefaultDepositPercent, "50", "Anticipo por defecto (%)"},
	{models.SettingQuoteValidityHours, "48", "Vigencia de las cotizaciones en horas"},
	{models.SettingFreeShippingThresholdCOP, "300000", "Envío nacional gratis desde este subtotal (COP)"},
}

// seedSettings no pisa valores existentes: si el admin cambió la TRM, el seed la respeta.
func seedSettings(tx *gorm.DB) error {
	for _, s := range settingSeeds {
		row := models.Setting{Key: s.Key, Value: models.JSONB(s.Value), Description: s.Description}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

// Tarifas por categoría de encargo (SSD §10.8). Los costos arrancan en 0 hasta tener la tarifa
// real del courier: mientras tanto la logística de cualquier cotización será $0.
var importRateSeeds = []models.ImportRate{
	{Name: "Tenis / sneakers (con caja)", AvgWeightLb: 4.0, Notes: "Verificar peso volumétrico"},
	{Name: "Ropa ligera", AvgWeightLb: 0.8},
	{Name: "Ropa pesada", AvgWeightLb: 2.5},
	{Name: "Gorras y accesorios pequeños", AvgWeightLb: 0.8},
	{Name: "Tecnología pequeña", AvgWeightLb: 1.5, Notes: "Las baterías de litio pueden tener restricciones"},
	{Name: "Tecnología mediana", AvgWeightLb: 6.0, RequiresManualQuote: true},
	{Name: "Otro / voluminoso", RequiresManualQuote: true},
}

// seedImportRates no pisa tarifas existentes: si el admin ya las editó, se respetan.
func seedImportRates(tx *gorm.DB) error {
	for i, r := range importRateSeeds {
		r.IsActive = true
		r.SortOrder = i
		if err := tx.Where(models.ImportRate{Name: r.Name}).FirstOrCreate(&r).Error; err != nil {
			return err
		}
	}
	return nil
}
