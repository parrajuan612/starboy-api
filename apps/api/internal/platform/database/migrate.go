package database

import (
	"fmt"

	"gorm.io/gorm"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

// Models devuelve los modelos en orden de dependencia (§9.2).
func Models() []any {
	return []any{
		&models.User{},
		&models.Address{},
		&models.Brand{},
		&models.Category{},
		&models.Product{},
		&models.ProductImage{},
		&models.ProductVariant{},
		&models.ImportRate{},
		&models.ImportRequest{},
		&models.ImportRequestItem{},
		&models.ImportQuote{},
		&models.ImportStatusHistory{},
		&models.Setting{},
		&models.SiteContent{},
		&models.Order{},
		&models.OrderItem{},
		&models.OrderStatusHistory{},
		&models.Payment{},
		&models.InventoryMovement{},
	}
}

var preMigrateSQL = []string{
	`CREATE EXTENSION IF NOT EXISTS pg_trgm`,
	`CREATE SEQUENCE IF NOT EXISTS import_request_code_seq START 1`,
	`CREATE SEQUENCE IF NOT EXISTS order_code_seq START 1`,
}

var postMigrateSQL = []string{
	`CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_one_accepted
	   ON import_quotes (import_request_id) WHERE status = 'ACCEPTED'`,
	`CREATE UNIQUE INDEX IF NOT EXISTS uq_address_one_default
	   ON addresses (user_id) WHERE is_default`,
	`CREATE INDEX IF NOT EXISTS idx_products_name_trgm
	   ON products USING gin (name gin_trgm_ops)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_one_approved_per_kind
	   ON payments (import_request_id, kind) WHERE status = 'APPROVED' AND import_request_id IS NOT NULL`,
	`CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_one_approved_per_order
	   ON payments (order_id, kind) WHERE status = 'APPROVED' AND order_id IS NOT NULL`,
	`CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_user_idempotency
	   ON orders (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`,
	`CREATE INDEX IF NOT EXISTS idx_import_requests_user_created
	   ON import_requests (user_id, created_at DESC)`,
	// La bitácora de inventario es inmutable: ni la app ni un UPDATE manual pueden reescribirla.
	`CREATE OR REPLACE FUNCTION inventory_movements_immutable() RETURNS trigger AS $$
	 BEGIN
	   RAISE EXCEPTION 'inventory_movements es de solo inserción';
	 END;
	 $$ LANGUAGE plpgsql`,
	`DROP TRIGGER IF EXISTS trg_inventory_movements_immutable ON inventory_movements`,
	`CREATE TRIGGER trg_inventory_movements_immutable
	   BEFORE UPDATE OR DELETE ON inventory_movements
	   FOR EACH ROW EXECUTE FUNCTION inventory_movements_immutable()`,
}

// Migrate aplica preMigrate -> AutoMigrate -> postMigrate en una transacción.
// Es idempotente: se puede correr en cada arranque.
func Migrate(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		for _, q := range preMigrateSQL {
			if err := tx.Exec(q).Error; err != nil {
				return fmt.Errorf("preMigrate: %w", err)
			}
		}
		if err := tx.AutoMigrate(Models()...); err != nil {
			return fmt.Errorf("AutoMigrate: %w", err)
		}
		for _, q := range postMigrateSQL {
			if err := tx.Exec(q).Error; err != nil {
				return fmt.Errorf("postMigrate: %w", err)
			}
		}
		return nil
	})
}
