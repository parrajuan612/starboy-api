// Package models contiene las entidades del dominio mapeadas con GORM.
//
// Convenciones:
//   - IDs UUID generados por PostgreSQL (gen_random_uuid(), nativo desde PG 13).
//   - Dinero SIEMPRE en int64: pesos COP sin decimales (*COP) o centavos de dólar (*USDCents).
//   - Enumeraciones como string + restricción CHECK con nombre en la BD.
//   - El esquema se crea/actualiza con AutoMigrate a partir de estos structs.
package models

import (
	"time"

	"github.com/google/uuid"
)

// Base agrega id y fechas de auditoría a cada tabla.
type Base struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CreatedAt time.Time `gorm:"not null" json:"created_at"`
	UpdatedAt time.Time `gorm:"not null" json:"updated_at"`
}
