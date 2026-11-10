package models

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Role define los permisos de un usuario.
type Role string

const (
	RoleCustomer Role = "CUSTOMER"
	RoleStaff    Role = "STAFF"
	RoleAdmin    Role = "ADMIN"
)

// IsBackoffice indica si el rol puede entrar al panel /admin.
func (r Role) IsBackoffice() bool { return r == RoleAdmin || r == RoleStaff }

// User representa clientes, staff y administradores (una tabla, distinto rol).
type User struct {
	Base
	Email        string     `gorm:"type:varchar(255);not null;uniqueIndex" json:"email"`
	PasswordHash string     `gorm:"type:varchar(255);not null" json:"-"`
	FullName     string     `gorm:"type:varchar(150);not null" json:"full_name"`
	Phone        string     `gorm:"type:varchar(30)" json:"phone,omitempty"`
	DocumentID   string     `gorm:"type:varchar(30)" json:"document_id,omitempty"` // cédula: necesaria para encargos (aduanas)
	Role         Role       `gorm:"type:varchar(20);not null;default:'CUSTOMER';index;check:chk_users_role,role IN ('CUSTOMER','STAFF','ADMIN')" json:"role"`
	IsActive     bool       `gorm:"not null;default:true" json:"is_active"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty"`
	Addresses    []Address  `gorm:"constraint:OnDelete:CASCADE" json:"addresses,omitempty"`
}

// BeforeSave normaliza el email para que el índice único no distinga mayúsculas.
func (u *User) BeforeSave(_ *gorm.DB) error {
	u.Email = strings.ToLower(strings.TrimSpace(u.Email))
	return nil
}

// Address es una dirección de envío en Colombia.
type Address struct {
	Base
	UserID     uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	Label      string    `gorm:"type:varchar(50)" json:"label,omitempty"` // "Casa", "Oficina"
	Department string    `gorm:"type:varchar(80);not null" json:"department"`
	City       string    `gorm:"type:varchar(80);not null" json:"city"`
	DaneCode   string    `gorm:"type:varchar(10)" json:"dane_code,omitempty"`
	Line1      string    `gorm:"type:varchar(200);not null" json:"line1"`
	Line2      string    `gorm:"type:varchar(200)" json:"line2,omitempty"`
	Notes      string    `gorm:"type:varchar(300)" json:"notes,omitempty"`
	IsDefault  bool      `gorm:"not null;default:false" json:"is_default"`
}
