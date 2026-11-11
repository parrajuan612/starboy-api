package settings

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

// SettingResponse es un parámetro con su valor actual y las reglas para editarlo.
type SettingResponse struct {
	Spec
	Value     int64      `json:"value"`
	UpdatedAt *time.Time `json:"updated_at,omitempty"`
}

// UpdateRequest cambia solo los parámetros que vienen en `values` (clave → entero).
type UpdateRequest struct {
	Values map[string]int64 `json:"values" binding:"required,min=1"`
}

// AdminService edita los parámetros de negocio. Los cambios aplican a las cotizaciones nuevas: las ya
// emitidas conservan los valores con que se calcularon (params_used).
type AdminService struct{ db *gorm.DB }

// NewAdminService crea el servicio.
func NewAdminService(db *gorm.DB) *AdminService { return &AdminService{db: db} }

func (s *AdminService) List(ctx context.Context) ([]SettingResponse, error) {
	var rows []models.Setting
	if err := s.db.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, apperr.Internal(err)
	}
	by := make(map[string]models.Setting, len(rows))
	for _, r := range rows {
		by[r.Key] = r
	}
	out := make([]SettingResponse, 0, len(Specs))
	for _, sp := range Specs {
		item := SettingResponse{Spec: sp}
		if r, ok := by[sp.Key]; ok {
			_ = json.Unmarshal(r.Value, &item.Value)
			t := r.UpdatedAt
			item.UpdatedAt = &t
		}
		out = append(out, item)
	}
	return out, nil
}

// Update valida TODOS los valores antes de guardar: si uno falla, no se cambia ninguno.
func (s *AdminService) Update(ctx context.Context, in UpdateRequest) ([]SettingResponse, error) {
	known := make(map[string]Spec, len(Specs))
	for _, sp := range Specs {
		known[sp.Key] = sp
	}
	details := map[string]string{}
	for k, v := range in.Values {
		sp, ok := known[k]
		switch {
		case !ok:
			details[k] = "Este parámetro no existe."
		case v < sp.Min || v > sp.Max:
			details[k] = fmt.Sprintf("Debe estar entre %d y %d.", sp.Min, sp.Max)
		}
	}
	if len(details) > 0 {
		return nil, apperr.New(apperr.KindValidation, "VALIDATION_ERROR", "Revisa los valores marcados.").WithDetails(details)
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for k, v := range in.Values {
			raw, _ := json.Marshal(v)
			row := models.Setting{Key: k, Value: models.JSONB(raw), UpdatedAt: time.Now()}
			if err := tx.Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "key"}}, DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
			}).Create(&row).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, apperr.Internal(err)
	}
	return s.List(ctx)
}

// AdminHandler expone GET/PUT /admin/settings (solo ADMIN: el grupo ya viene protegido).
type AdminHandler struct{ svc *AdminService }

// NewAdminHandler crea el handler.
func NewAdminHandler(svc *AdminService) *AdminHandler { return &AdminHandler{svc: svc} }

// RegisterRoutes monta /admin/settings.
func (h *AdminHandler) RegisterRoutes(g *gin.RouterGroup) {
	g.GET("/settings", h.list)
	g.PUT("/settings", h.update)
}

func (h *AdminHandler) list(c *gin.Context) {
	out, err := h.svc.List(c.Request.Context())
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}

func (h *AdminHandler) update(c *gin.Context) {
	var in UpdateRequest
	if !response.BindJSON(c, &in) {
		return
	}
	out, err := h.svc.Update(c.Request.Context(), in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.JSON(c, http.StatusOK, out)
}
