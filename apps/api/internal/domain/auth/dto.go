package auth

import (
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

// RegisterRequest: el rol NO se recibe; siempre es CUSTOMER (evita asignación masiva, SSD §13).
type RegisterRequest struct {
	Email      string `json:"email" binding:"required,email,max=255"`
	Password   string `json:"password" binding:"required,min=8,max=72"` // bcrypt solo lee 72 bytes
	FullName   string `json:"full_name" binding:"required,min=2,max=150"`
	Phone      string `json:"phone" binding:"omitempty,max=30"`
	DocumentID string `json:"document_id" binding:"omitempty,max=30"`
}

// LoginRequest son las credenciales.
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email,max=255"`
	Password string `json:"password" binding:"required,max=72"`
}

// UserResponse es la vista pública del usuario (sin hash ni campos internos).
type UserResponse struct {
	ID          uuid.UUID   `json:"id"`
	Email       string      `json:"email"`
	FullName    string      `json:"full_name"`
	Phone       string      `json:"phone,omitempty"`
	DocumentID  string      `json:"document_id,omitempty"`
	Role        models.Role `json:"role"`
	LastLoginAt *time.Time  `json:"last_login_at,omitempty"`
}

// AuthResponse es el cuerpo de register/login. El refresh token viaja solo en la cookie.
type AuthResponse struct {
	AccessToken string       `json:"access_token"`
	TokenType   string       `json:"token_type"`
	ExpiresIn   int          `json:"expires_in"` // segundos
	User        UserResponse `json:"user"`
}

func ToUserResponse(u *models.User) UserResponse {
	return UserResponse{
		ID: u.ID, Email: u.Email, FullName: u.FullName, Phone: u.Phone,
		DocumentID: u.DocumentID, Role: u.Role, LastLoginAt: u.LastLoginAt,
	}
}
