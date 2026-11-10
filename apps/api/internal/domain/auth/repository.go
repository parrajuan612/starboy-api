package auth

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

var (
	errNotFound   = errors.New("usuario no encontrado")
	errEmailTaken = errors.New("correo ya registrado")
)

// Repository es el acceso a datos de usuarios.
type Repository interface {
	Create(ctx context.Context, u *models.User) error
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	FindByID(ctx context.Context, id uuid.UUID) (*models.User, error)
	TouchLastLogin(ctx context.Context, id uuid.UUID, at time.Time) error
}

type gormRepository struct{ db *gorm.DB }

// NewRepository crea el repositorio GORM.
func NewRepository(db *gorm.DB) Repository { return &gormRepository{db: db} }

func (r *gormRepository) Create(ctx context.Context, u *models.User) error {
	err := r.db.WithContext(ctx).Create(u).Error
	if errors.Is(err, gorm.ErrDuplicatedKey) { // TranslateError: true
		return errEmailTaken
	}
	return err
}

func (r *gormRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := r.db.WithContext(ctx).Where("email = ?", email).First(&u).Error
	return wrapFind(&u, err)
}

func (r *gormRepository) FindByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	var u models.User
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&u).Error
	return wrapFind(&u, err)
}

func (r *gormRepository) TouchLastLogin(ctx context.Context, id uuid.UUID, at time.Time) error {
	return r.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", id).
		UpdateColumn("last_login_at", at).Error
}

func wrapFind(u *models.User, err error) (*models.User, error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}
