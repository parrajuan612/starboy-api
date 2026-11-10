// Package http arma el router de Gin: /health y /api/v1.
package http

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/config"
	"github.com/juancamiloparra/starboy-api/internal/domain/auth"
	"github.com/juancamiloparra/starboy-api/internal/domain/catalog"
	"github.com/juancamiloparra/starboy-api/internal/domain/importreq"
	"github.com/juancamiloparra/starboy-api/internal/domain/inventory"
	"github.com/juancamiloparra/starboy-api/internal/domain/order"
	"github.com/juancamiloparra/starboy-api/internal/domain/payment"
	"github.com/juancamiloparra/starboy-api/internal/domain/settings"
	"github.com/juancamiloparra/starboy-api/internal/domain/user"
	"github.com/juancamiloparra/starboy-api/internal/http/middleware"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
	"github.com/juancamiloparra/starboy-api/internal/platform/payments"
	"github.com/juancamiloparra/starboy-api/internal/platform/token"
)

// Services expone lo que el proceso necesita fuera de HTTP (tareas periódicas).
type Services struct {
	Orders *order.Service
}

// NewRouter conecta repositorios -> servicios -> handlers.
func NewRouter(cfg *config.Config, db *gorm.DB) (*gin.Engine, *Services) {
	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	// IP real del cliente (rate limit): X-Forwarded-For solo se respeta cuando la conexión directa viene
	// de un proxy declarado en TRUSTED_PROXIES (Next, Caddy). Una conexión de cualquier otro origen no
	// puede falsear su IP. Gin recorre la cadena de derecha a izquierda saltando los proxies de confianza.
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		slog.Error("TRUSTED_PROXIES inválido; no se confía en ningún proxy", "error", err)
		_ = r.SetTrustedProxies(nil)
	}
	r.HandleMethodNotAllowed = true
	r.Use(middleware.RequestID(), gin.Logger(), middleware.Recovery())

	r.NoRoute(func(c *gin.Context) {
		response.Fail(c, apperr.New(apperr.KindNotFound, "NOT_FOUND", "No encontramos lo que buscas."))
	})
	r.NoMethod(func(c *gin.Context) {
		c.AbortWithStatusJSON(http.StatusMethodNotAllowed, gin.H{"error": gin.H{
			"code": "METHOD_NOT_ALLOWED", "message": "Método no permitido para esta ruta.",
		}})
	})

	r.GET("/health", health(db))

	tokens := token.NewManager(cfg.JWT)
	api := r.Group("/api/v1")

	authSvc := auth.NewService(auth.NewRepository(db), tokens)
	auth.NewHandler(authSvc, cfg.IsProduction()).
		RegisterRoutes(api, middleware.Auth(tokens), middleware.RateLimit(10, time.Minute), middleware.RateLimit(30, time.Minute))

	user.NewHandler(user.NewService(db)).RegisterRoutes(api, middleware.Auth(tokens), middleware.RateLimit(30, time.Minute))

	catalog.NewHandler(catalog.NewService(catalog.NewRepository(db))).RegisterRoutes(api)

	// Panel: solo ADMIN. (STAFF tendrá sus propias rutas de inventario/órdenes en H3, sin precios.)
	admin := api.Group("/admin", middleware.Auth(tokens), middleware.RequireRole(models.RoleAdmin))
	catalog.NewAdminHandler(catalog.NewAdminService(catalog.NewAdminRepository(db))).RegisterRoutes(admin)

	// Encargos USA: cotizador y solicitudes (cliente) + bandeja y estados (ADMIN y STAFF, SSD §3).
	importSvc := importreq.NewService(importreq.NewRepository(db), settings.NewService(settings.NewReader(db)))
	importreq.NewHandler(importSvc).RegisterRoutes(api,
		middleware.Auth(tokens), middleware.RateLimit(30, time.Minute), middleware.RateLimit(10, time.Minute))
	// Órdenes de la tienda (compra directa, con reserva atómica de stock).
	orderSvc := order.NewService(order.NewRepository(db), order.NewUserReader(db))
	order.NewHandler(orderSvc).RegisterRoutes(api, middleware.Auth(tokens), middleware.RateLimit(10, time.Minute))

	// Pagos. La pasarela simulada solo existe fuera de producción: en producción no hay forma
	// de "pagar" sin dinero. Mercado Pago se registra aquí cuando se integre.
	var gateways []payments.Provider
	if !cfg.IsProduction() {
		gateways = append(gateways, payments.NewSandbox(cfg.Payments.WebhookSecret, cfg.Payments.WebBaseURL))
	}
	paymentHandler := payment.NewHandler(payment.NewService(payment.NewRepository(db), gateways...), !cfg.IsProduction())
	paymentHandler.RegisterRoutes(api, middleware.Auth(tokens), middleware.RateLimit(10, time.Minute))

	backoffice := api.Group("/admin", middleware.Auth(tokens), middleware.RequireRole(models.RoleAdmin, models.RoleStaff))
	importreq.NewAdminHandler(importSvc).RegisterRoutes(backoffice)
	importreq.NewAdminHandler(importSvc).RegisterPriceRoutes(admin) // cotizaciones: solo ADMIN
	paymentHandler.RegisterAdminRoutes(admin)
	order.NewAdminHandler(orderSvc).RegisterRoutes(backoffice) // órdenes: ADMIN y STAFF
	inventory.NewHandler(db).RegisterRoutes(backoffice)        // bitácora de inventario: ADMIN y STAFF

	return r, &Services{Orders: orderSvc}
}

func health(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		sqlDB, err := db.DB()
		if err == nil {
			err = sqlDB.PingContext(ctx)
		}
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "degraded", "database": "down"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "database": "up"})
	}
}
