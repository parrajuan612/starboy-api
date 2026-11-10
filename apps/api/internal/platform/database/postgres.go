// Package database abre la conexión a PostgreSQL y aplica el esquema.
package database

import (
	"context"
	"fmt"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/juancamiloparra/starboy-api/internal/config"
)

// Connect abre GORM sobre PostgreSQL (pgx), configura el pool y hace ping.
func Connect(cfg config.DB) (*gorm.DB, error) {
	level := logger.Warn
	if cfg.LogSQL {
		level = logger.Info
	}

	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger:         logger.Default.LogMode(level),
		TranslateError: true, // errores de PG -> gorm.ErrDuplicatedKey, etc.
		NowFunc:        func() time.Time { return time.Now().UTC() },
	})
	if err != nil {
		return nil, fmt.Errorf("abrir conexión: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("obtener pool: %w", err)
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping a PostgreSQL: %w", err)
	}
	return db, nil
}
