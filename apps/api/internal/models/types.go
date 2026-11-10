package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
)

// JSONB guarda JSON arbitrario en una columna jsonb de PostgreSQL
// (settings, snapshot de parámetros de cotización, payload de pagos).
type JSONB json.RawMessage

// GormDataType indica a GORM el tipo de columna.
func (JSONB) GormDataType() string { return "jsonb" }

// Value implementa driver.Valuer.
func (j JSONB) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	if !json.Valid(j) {
		return nil, errors.New("JSONB: contenido no es JSON válido")
	}
	return string(j), nil
}

// Scan implementa sql.Scanner.
func (j *JSONB) Scan(src any) error {
	switch v := src.(type) {
	case nil:
		*j = nil
	case []byte:
		*j = append((*j)[:0], v...)
	case string:
		*j = JSONB(v)
	default:
		return fmt.Errorf("JSONB: tipo no soportado %T", src)
	}
	return nil
}

// MarshalJSON serializa el contenido tal cual (no como base64).
func (j JSONB) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}

// UnmarshalJSON guarda el JSON recibido tal cual.
func (j *JSONB) UnmarshalJSON(data []byte) error {
	*j = append((*j)[:0], data...)
	return nil
}
