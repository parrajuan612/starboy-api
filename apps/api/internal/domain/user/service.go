package user

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

var (
	docRe = regexp.MustCompile(`^[A-Za-z0-9]{5,20}$`)

	errAddrNotFound = apperr.New(apperr.KindNotFound, "ADDRESS_NOT_FOUND", "No encontramos esa dirección.")
	errTooMany      = apperr.New(apperr.KindConflict, "ADDRESS_LIMIT", "Llegaste al máximo de 10 direcciones. Elimina alguna para agregar otra.")
	errUserGone     = apperr.New(apperr.KindNotFound, "USER_NOT_FOUND", "No encontramos tu cuenta.")
)

func invalid(field, msg string) *apperr.Error {
	return apperr.New(apperr.KindValidation, "VALIDATION_ERROR", "Revisa los datos marcados.").WithDetails(map[string]string{field: msg})
}

// Service contiene las reglas del perfil y la libreta de direcciones.
type Service struct{ db *gorm.DB }

// NewService crea el servicio.
func NewService(db *gorm.DB) *Service { return &Service{db: db} }

// UpdateProfile aplica un PATCH parcial sobre nombre, celular y documento.
func (s *Service) UpdateProfile(ctx context.Context, id uuid.UUID, in UpdateProfileRequest) (*models.User, error) {
	updates := map[string]any{}
	if in.FullName != nil {
		n := strings.Join(strings.Fields(*in.FullName), " ")
		if len([]rune(n)) < 2 {
			return nil, invalid("full_name", "Escribe tu nombre completo.")
		}
		updates["full_name"] = n
	}
	if in.Phone != nil {
		updates["phone"] = strings.TrimSpace(*in.Phone)
	}
	if in.DocumentID != nil {
		d := strings.ToUpper(strings.NewReplacer(" ", "", ".", "", "-", "").Replace(*in.DocumentID))
		if d != "" && !docRe.MatchString(d) {
			return nil, invalid("document_id", "Escribe tu cédula o documento (5 a 20 números o letras).")
		}
		updates["document_id"] = d
	}
	var u models.User
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ? AND is_active", id).First(&u).Error; err != nil {
			return err
		}
		if len(updates) == 0 {
			return nil
		}
		return tx.Model(&u).Updates(updates).Error
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errUserGone
	}
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return &u, nil
}

// ListAddresses: la predeterminada primero, luego las más recientes.
func (s *Service) ListAddresses(ctx context.Context, uid uuid.UUID) ([]AddressResponse, error) {
	var rows []models.Address
	if err := s.db.WithContext(ctx).Where("user_id = ?", uid).
		Order("is_default DESC, created_at DESC, id").Find(&rows).Error; err != nil {
		return nil, apperr.Internal(err)
	}
	out := make([]AddressResponse, 0, len(rows))
	for i := range rows {
		out = append(out, toAddress(&rows[i]))
	}
	return out, nil
}

// lockUser serializa los cambios de la libreta de un mismo usuario (límite y "una sola predeterminada").
func lockUser(tx *gorm.DB, uid uuid.UUID) error {
	var u models.User
	return tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id").Where("id = ?", uid).First(&u).Error
}

func clearDefault(tx *gorm.DB, uid uuid.UUID, except uuid.UUID) error {
	return tx.Model(&models.Address{}).Where("user_id = ? AND id <> ? AND is_default", uid, except).
		UpdateColumn("is_default", false).Error
}

// CreateAddress: la primera dirección queda como predeterminada automáticamente.
func (s *Service) CreateAddress(ctx context.Context, uid uuid.UUID, in AddressRequest) (*AddressResponse, error) {
	a := models.Address{
		UserID: uid, Label: strings.TrimSpace(in.Label), Department: strings.TrimSpace(in.Department),
		City: strings.TrimSpace(in.City), DaneCode: strings.TrimSpace(in.DaneCode),
		Line1: strings.TrimSpace(in.Line1), Line2: strings.TrimSpace(in.Line2), Notes: strings.TrimSpace(in.Notes),
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockUser(tx, uid); err != nil {
			return err
		}
		var n int64
		if err := tx.Model(&models.Address{}).Where("user_id = ?", uid).Count(&n).Error; err != nil {
			return err
		}
		if n >= MaxAddresses {
			return errTooMany
		}
		if err := tx.Create(&a).Error; err != nil {
			return err
		}
		if in.IsDefault || n == 0 {
			if err := clearDefault(tx, uid, a.ID); err != nil {
				return err
			}
			a.IsDefault = true
			return tx.Model(&a).UpdateColumn("is_default", true).Error // GORM ignora valores cero al crear; se fija aparte
		}
		return nil
	})
	if err != nil {
		return nil, wrap(err)
	}
	r := toAddress(&a)
	return &r, nil
}

// UpdateAddress aplica un PATCH parcial; is_default=true desmarca la anterior. Una predeterminada no se puede
// desmarcar a mano: se cambia marcando otra (así siempre hay una si existe alguna dirección).
func (s *Service) UpdateAddress(ctx context.Context, uid, id uuid.UUID, in UpdateAddressRequest) (*AddressResponse, error) {
	var a models.Address
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockUser(tx, uid); err != nil {
			return err
		}
		if err := tx.Where("id = ? AND user_id = ?", id, uid).First(&a).Error; err != nil {
			return err
		}
		up := map[string]any{}
		set := func(key string, v *string, required bool, min int) *apperr.Error {
			if v == nil {
				return nil
			}
			t := strings.TrimSpace(*v)
			if required && len([]rune(t)) < min {
				return invalid(key, "Este campo es obligatorio.")
			}
			up[key] = t
			return nil
		}
		for _, f := range []struct {
			key string
			v   *string
			req bool
			min int
		}{
			{"label", in.Label, false, 0}, {"department", in.Department, true, 1}, {"city", in.City, true, 2},
			{"dane_code", in.DaneCode, false, 0}, {"line1", in.Line1, true, 5}, {"line2", in.Line2, false, 0},
			{"notes", in.Notes, false, 0},
		} {
			if e := set(f.key, f.v, f.req, f.min); e != nil {
				return e
			}
		}
		if len(up) > 0 {
			if err := tx.Model(&a).Updates(up).Error; err != nil {
				return err
			}
		}
		if in.IsDefault != nil && *in.IsDefault && !a.IsDefault {
			if err := clearDefault(tx, uid, a.ID); err != nil {
				return err
			}
			if err := tx.Model(&a).UpdateColumn("is_default", true).Error; err != nil {
				return err
			}
			a.IsDefault = true
		}
		return nil
	})
	if err != nil {
		return nil, wrap(err)
	}
	r := toAddress(&a)
	return &r, nil
}

// DeleteAddress borra la dirección; si era la predeterminada, la más reciente que quede pasa a serlo.
// Las órdenes guardan su propia copia de la dirección, así que no se afectan.
func (s *Service) DeleteAddress(ctx context.Context, uid, id uuid.UUID) error {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockUser(tx, uid); err != nil {
			return err
		}
		var a models.Address
		if err := tx.Where("id = ? AND user_id = ?", id, uid).First(&a).Error; err != nil {
			return err
		}
		if err := tx.Delete(&a).Error; err != nil {
			return err
		}
		if !a.IsDefault {
			return nil
		}
		var next models.Address
		err := tx.Where("user_id = ?", uid).Order("created_at DESC, id").First(&next).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		return tx.Model(&next).UpdateColumn("is_default", true).Error
	})
	return wrap(err)
}

func wrap(err error) error {
	var ae *apperr.Error
	switch {
	case err == nil:
		return nil
	case errors.As(err, &ae):
		return ae
	case errors.Is(err, gorm.ErrRecordNotFound):
		return errAddrNotFound
	default:
		return apperr.Internal(err)
	}
}
