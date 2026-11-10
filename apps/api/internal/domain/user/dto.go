// Package user implementa el perfil y las direcciones de envío del cliente autenticado.
package user

import (
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

// MaxAddresses limita la libreta de direcciones por cuenta (evita abuso de almacenamiento).
const MaxAddresses = 10

// UpdateProfileRequest: PATCH parcial. El correo y el rol NO se pueden cambiar por aquí.
// Un campo ausente no se toca; phone y document_id en "" se borran.
type UpdateProfileRequest struct {
	FullName   *string `json:"full_name" binding:"omitempty,max=150"`
	Phone      *string `json:"phone" binding:"omitempty,max=30"`
	DocumentID *string `json:"document_id" binding:"omitempty,max=30"`
}

type AddressRequest struct {
	Label      string `json:"label" binding:"omitempty,max=50"`
	Department string `json:"department" binding:"required,max=80"`
	City       string `json:"city" binding:"required,min=2,max=80"`
	DaneCode   string `json:"dane_code" binding:"omitempty,max=10"`
	Line1      string `json:"line1" binding:"required,min=5,max=200"`
	Line2      string `json:"line2" binding:"omitempty,max=200"`
	Notes      string `json:"notes" binding:"omitempty,max=300"`
	IsDefault  bool   `json:"is_default"`
}

// UpdateAddressRequest: PATCH parcial.
type UpdateAddressRequest struct {
	Label      *string `json:"label" binding:"omitempty,max=50"`
	Department *string `json:"department" binding:"omitempty,max=80"`
	City       *string `json:"city" binding:"omitempty,max=80"`
	DaneCode   *string `json:"dane_code" binding:"omitempty,max=10"`
	Line1      *string `json:"line1" binding:"omitempty,max=200"`
	Line2      *string `json:"line2" binding:"omitempty,max=200"`
	Notes      *string `json:"notes" binding:"omitempty,max=300"`
	IsDefault  *bool   `json:"is_default"`
}

type AddressResponse struct {
	ID         uuid.UUID `json:"id"`
	Label      string    `json:"label,omitempty"`
	Department string    `json:"department"`
	City       string    `json:"city"`
	DaneCode   string    `json:"dane_code,omitempty"`
	Line1      string    `json:"line1"`
	Line2      string    `json:"line2,omitempty"`
	Notes      string    `json:"notes,omitempty"`
	IsDefault  bool      `json:"is_default"`
	CreatedAt  time.Time `json:"created_at"`
}

func toAddress(a *models.Address) AddressResponse {
	return AddressResponse{
		ID: a.ID, Label: a.Label, Department: a.Department, City: a.City, DaneCode: a.DaneCode,
		Line1: a.Line1, Line2: a.Line2, Notes: a.Notes, IsDefault: a.IsDefault, CreatedAt: a.CreatedAt,
	}
}
