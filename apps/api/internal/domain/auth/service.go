package auth

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/models"
	"github.com/juancamiloparra/starboy-api/internal/platform/token"
)

const bcryptCost = 12 // SSD §13

// Result es lo que el handler necesita para responder: cuerpo + refresh token para la cookie.
type Result struct {
	Body         AuthResponse
	RefreshToken string
	RefreshTTL   time.Duration
}

var (
	errInvalidCredentials = apperr.New(apperr.KindUnauthorized, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.")
	errEmailTakenApp      = apperr.New(apperr.KindConflict, "EMAIL_TAKEN", "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.")
	errDisabled           = apperr.New(apperr.KindForbidden, "ACCOUNT_DISABLED", "Tu cuenta está desactivada. Escríbenos y te ayudamos.")
	errNoSession          = apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar.")
	errSessionExpired     = apperr.New(apperr.KindUnauthorized, "SESSION_EXPIRED", "Tu sesión venció. Inicia sesión de nuevo.")
	errUserNotFound       = apperr.New(apperr.KindNotFound, "USER_NOT_FOUND", "No encontramos tu cuenta.")
)

// Service contiene las reglas de negocio de autenticación.
type Service struct {
	repo   Repository
	tokens *token.Manager
}

// NewService crea el servicio.
func NewService(repo Repository, tokens *token.Manager) *Service {
	return &Service{repo: repo, tokens: tokens}
}

func normalizeEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

// Register crea un cliente (rol CUSTOMER siempre) y lo deja con sesión iniciada.
func (s *Service) Register(ctx context.Context, in RegisterRequest) (*Result, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcryptCost)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	now := time.Now().UTC()
	u := &models.User{
		Email:        normalizeEmail(in.Email),
		PasswordHash: string(hash),
		FullName:     strings.TrimSpace(in.FullName),
		Phone:        strings.TrimSpace(in.Phone),
		DocumentID:   strings.TrimSpace(in.DocumentID),
		Role:         models.RoleCustomer,
		IsActive:     true,
		LastLoginAt:  &now,
	}
	if err := s.repo.Create(ctx, u); err != nil {
		if errors.Is(err, errEmailTaken) {
			return nil, errEmailTakenApp
		}
		return nil, apperr.Internal(err)
	}
	return s.issue(u)
}

// Login valida credenciales. El mensaje es el mismo si el correo no existe o la clave falla,
// y se compara contra un hash falso para que el tiempo de respuesta no delate cuentas existentes.
func (s *Service) Login(ctx context.Context, in LoginRequest) (*Result, error) {
	u, err := s.repo.FindByEmail(ctx, normalizeEmail(in.Email))
	if err != nil {
		if errors.Is(err, errNotFound) {
			_ = bcrypt.CompareHashAndPassword(dummyHash(), []byte(in.Password))
			return nil, errInvalidCredentials
		}
		return nil, apperr.Internal(err)
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)) != nil {
		return nil, errInvalidCredentials
	}
	if !u.IsActive {
		return nil, errDisabled
	}
	now := time.Now().UTC()
	if err := s.repo.TouchLastLogin(ctx, u.ID, now); err != nil {
		return nil, apperr.Internal(err)
	}
	u.LastLoginAt = &now
	return s.issue(u)
}

// Refresh renueva el access token a partir del refresh token de la cookie y rota el refresh.
// Relee el usuario de la BD: si fue desactivado o cambió de rol, el nuevo token lo refleja.
func (s *Service) Refresh(ctx context.Context, raw string) (*Result, error) {
	if raw == "" {
		return nil, errNoSession
	}
	claims, err := s.tokens.ParseRefresh(raw)
	if err != nil {
		if errors.Is(err, token.ErrExpired) {
			return nil, errSessionExpired
		}
		return nil, errNoSession
	}
	u, err := s.repo.FindByID(ctx, claims.UserID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return nil, errNoSession
		}
		return nil, apperr.Internal(err)
	}
	if !u.IsActive {
		return nil, errDisabled
	}
	return s.issue(u)
}

// Me devuelve el perfil del usuario autenticado.
func (s *Service) Me(ctx context.Context, id uuid.UUID) (*UserResponse, error) {
	u, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, errNotFound) {
			return nil, errUserNotFound
		}
		return nil, apperr.Internal(err)
	}
	if !u.IsActive {
		return nil, errDisabled
	}
	r := ToUserResponse(u)
	return &r, nil
}

func (s *Service) issue(u *models.User) (*Result, error) {
	access, err := s.tokens.IssueAccess(u.ID, u.Role)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	refresh, err := s.tokens.IssueRefresh(u.ID)
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return &Result{
		Body: AuthResponse{
			AccessToken: access,
			TokenType:   "Bearer",
			ExpiresIn:   int(s.tokens.AccessTTL().Seconds()),
			User:        ToUserResponse(u),
		},
		RefreshToken: refresh,
		RefreshTTL:   s.tokens.RefreshTTL(),
	}, nil
}

var (
	dummyOnce sync.Once
	dummy     []byte
)

func dummyHash() []byte {
	dummyOnce.Do(func() {
		dummy, _ = bcrypt.GenerateFromPassword([]byte("starboy-dummy-password"), bcryptCost)
	})
	return dummy
}
