// Package token emite y valida los JWT de acceso (corto plazo) y de refresh (cookie httpOnly).
// Cada tipo usa su propio secreto y un claim "typ", así uno nunca sirve como el otro.
package token

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/config"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

const (
	issuer      = "starboy"
	typeAccess  = "access"
	typeRefresh = "refresh"
)

var (
	// ErrExpired indica un token válido pero vencido (el cliente debe renovarlo).
	ErrExpired = errors.New("token vencido")
	// ErrInvalid cubre firma incorrecta, formato roto o tipo equivocado.
	ErrInvalid = errors.New("token inválido")
)

// Claims es lo que el resto de la API necesita saber del token.
type Claims struct {
	UserID uuid.UUID
	Role   models.Role
}

type tokenClaims struct {
	Role models.Role `json:"role,omitempty"`
	Type string      `json:"typ"`
	jwt.RegisteredClaims
}

// Manager firma y verifica tokens.
type Manager struct {
	accessSecret  []byte
	refreshSecret []byte
	accessTTL     time.Duration
	refreshTTL    time.Duration
}

// NewManager crea el gestor a partir de la configuración.
func NewManager(cfg config.JWT) *Manager {
	return &Manager{
		accessSecret:  []byte(cfg.AccessSecret),
		refreshSecret: []byte(cfg.RefreshSecret),
		accessTTL:     cfg.AccessTTL,
		refreshTTL:    cfg.RefreshTTL,
	}
}

func (m *Manager) AccessTTL() time.Duration  { return m.accessTTL }
func (m *Manager) RefreshTTL() time.Duration { return m.refreshTTL }

// IssueAccess emite el token de acceso (lleva el rol para el RBAC).
func (m *Manager) IssueAccess(userID uuid.UUID, role models.Role) (string, error) {
	return m.sign(m.accessSecret, typeAccess, userID, role, m.accessTTL)
}

// IssueRefresh emite el token de refresh (solo identifica al usuario; el rol se relee de la BD).
func (m *Manager) IssueRefresh(userID uuid.UUID) (string, error) {
	return m.sign(m.refreshSecret, typeRefresh, userID, "", m.refreshTTL)
}

// ParseAccess valida un token de acceso.
func (m *Manager) ParseAccess(raw string) (*Claims, error) {
	return m.parse(raw, m.accessSecret, typeAccess)
}

// ParseRefresh valida un token de refresh.
func (m *Manager) ParseRefresh(raw string) (*Claims, error) {
	return m.parse(raw, m.refreshSecret, typeRefresh)
}

func (m *Manager) sign(secret []byte, typ string, userID uuid.UUID, role models.Role, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := tokenClaims{
		Role: role,
		Type: typ,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			Subject:   userID.String(),
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	if err != nil {
		return "", fmt.Errorf("firmar token %s: %w", typ, err)
	}
	return signed, nil
}

func (m *Manager) parse(raw string, secret []byte, typ string) (*Claims, error) {
	var tc tokenClaims
	_, err := jwt.ParseWithClaims(raw, &tc,
		func(*jwt.Token) (any, error) { return secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(issuer),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpired
		}
		return nil, ErrInvalid
	}
	if tc.Type != typ {
		return nil, ErrInvalid
	}
	id, err := uuid.Parse(tc.Subject)
	if err != nil {
		return nil, ErrInvalid
	}
	return &Claims{UserID: id, Role: tc.Role}, nil
}
