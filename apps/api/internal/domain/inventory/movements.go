package inventory

import (
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

// MovementQuery filtra la bitácora. Todo es opcional.
type MovementQuery struct {
	VariantID string `form:"variant_id" binding:"omitempty,uuid"`
	OrderID   string `form:"order_id" binding:"omitempty,uuid"`
	Type      string `form:"type" binding:"omitempty,oneof=RESERVE RELEASE COMMIT RESTOCK ADJUSTMENT"`
	Page      int    `form:"page" binding:"omitempty,gte=1"`
	Limit     int    `form:"limit" binding:"omitempty,gte=1,lte=100"`
}

// MovementResponse es una fila de la bitácora con los nombres ya resueltos.
type MovementResponse struct {
	ID            uuid.UUID           `json:"id"`
	CreatedAt     time.Time           `json:"created_at"`
	Type          models.MovementType `json:"type"`
	VariantID     uuid.UUID           `json:"variant_id"`
	SKU           string              `json:"sku"`
	Size          string              `json:"size"`
	ProductName   string              `json:"product_name"`
	OrderID       *uuid.UUID          `json:"order_id,omitempty"`
	OrderCode     string              `json:"order_code,omitempty"`
	DeltaOnHand   int                 `json:"delta_on_hand"`
	DeltaReserved int                 `json:"delta_reserved"`
	OnHandAfter   int                 `json:"on_hand_after"`
	ReservedAfter int                 `json:"reserved_after"`
	Reason        string              `json:"reason,omitempty"`
	ActorID       *uuid.UUID          `json:"actor_id,omitempty"`
	ActorName     string              `json:"actor_name,omitempty"` // vacío = proceso automático
}

// Handler consulta la bitácora de inventario.
type Handler struct{ db *gorm.DB }

// NewHandler crea el handler.
func NewHandler(db *gorm.DB) *Handler { return &Handler{db: db} }

// RegisterRoutes monta GET /inventory/movements bajo el grupo del panel.
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/inventory/movements", h.list)
	rg.GET("/inventory/stock", h.stock)
}

func (h *Handler) list(c *gin.Context) {
	var q MovementQuery
	if !response.BindQuery(c, &q) {
		return
	}
	page, limit := max(q.Page, 1), q.Limit
	if limit < 1 {
		limit = 50
	}
	build := func() *gorm.DB {
		t := h.db.WithContext(c.Request.Context()).Table("inventory_movements AS m")
		if q.VariantID != "" {
			t = t.Where("m.variant_id = ?", q.VariantID)
		}
		if q.OrderID != "" {
			t = t.Where("m.order_id = ?", q.OrderID)
		}
		if q.Type != "" {
			t = t.Where("m.type = ?", q.Type)
		}
		return t
	}
	var total int64
	if err := build().Count(&total).Error; err != nil {
		response.Fail(c, apperr.Internal(err))
		return
	}
	rows := []MovementResponse{}
	if total > 0 && (page-1)*limit < int(total) {
		err := build().
			Select(`m.id, m.created_at, m.type, m.variant_id, v.sku, v.size, p.name AS product_name,
			        m.order_id, o.code AS order_code, m.delta_on_hand, m.delta_reserved,
			        m.on_hand_after, m.reserved_after, m.reason, m.actor_id, u.full_name AS actor_name`).
			Joins("JOIN product_variants v ON v.id = m.variant_id").
			Joins("JOIN products p ON p.id = v.product_id").
			Joins("LEFT JOIN orders o ON o.id = m.order_id").
			Joins("LEFT JOIN users u ON u.id = m.actor_id").
			Order("m.created_at DESC, m.id").Offset((page - 1) * limit).Limit(limit).
			Scan(&rows).Error
		if err != nil {
			response.Fail(c, apperr.Internal(err))
			return
		}
	}
	c.Header("Cache-Control", "no-store")
	response.Paginated(c, rows, response.NewMeta(page, limit, total))
}

// LowStockThreshold: con esta cantidad disponible o menos, la variante se marca "poco stock".
const LowStockThreshold = 3

// StockQuery filtra el stock por variante.
type StockQuery struct {
	Q      string `form:"q" binding:"omitempty,max=100"` // producto, marca o SKU
	Filter string `form:"filter" binding:"omitempty,oneof=low out"`
	Page   int    `form:"page" binding:"omitempty,gte=1"`
	Limit  int    `form:"limit" binding:"omitempty,gte=1,lte=100"`
}

// StockRow es el stock de una variante (talla).
type StockRow struct {
	VariantID   uuid.UUID `json:"variant_id"`
	ProductID   uuid.UUID `json:"product_id"`
	ProductName string    `json:"product_name"`
	Brand       string    `json:"brand"`
	Status      string    `json:"product_status"`
	SKU         string    `json:"sku"`
	Size        string    `json:"size"`
	OnHand      int       `json:"stock_on_hand"`
	Reserved    int       `json:"stock_reserved"`
	Available   int       `json:"available"`
}

func (h *Handler) stock(c *gin.Context) {
	var q StockQuery
	if !response.BindQuery(c, &q) {
		return
	}
	page, limit := max(q.Page, 1), q.Limit
	if limit < 1 {
		limit = 50
	}
	build := func() *gorm.DB {
		t := h.db.WithContext(c.Request.Context()).Table("product_variants AS v").
			Joins("JOIN products p ON p.id = v.product_id").
			Joins("JOIN brands b ON b.id = p.brand_id")
		if s := strings.TrimSpace(q.Q); s != "" {
			like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(strings.ToLower(s)) + "%"
			t = t.Where("LOWER(p.name) LIKE ? OR LOWER(b.name) LIKE ? OR LOWER(v.sku) LIKE ?", like, like, like)
		}
		switch q.Filter {
		case "out":
			t = t.Where("v.stock_on_hand - v.stock_reserved <= 0")
		case "low":
			t = t.Where("v.stock_on_hand - v.stock_reserved BETWEEN 1 AND ?", LowStockThreshold)
		}
		return t
	}
	var total int64
	if err := build().Count(&total).Error; err != nil {
		response.Fail(c, apperr.Internal(err))
		return
	}
	rows := []StockRow{}
	if total > 0 && (page-1)*limit < int(total) {
		err := build().
			Select(`v.id AS variant_id, p.id AS product_id, p.name AS product_name, b.name AS brand, p.status,
			        v.sku, v.size, v.stock_on_hand AS on_hand, v.stock_reserved AS reserved,
			        v.stock_on_hand - v.stock_reserved AS available`).
			Order("(v.stock_on_hand - v.stock_reserved) ASC, p.name, v.sort_order, v.id").
			Offset((page - 1) * limit).Limit(limit).Scan(&rows).Error
		if err != nil {
			response.Fail(c, apperr.Internal(err))
			return
		}
	}
	c.Header("Cache-Control", "no-store")
	response.Paginated(c, rows, response.NewMeta(page, limit, total))
}
