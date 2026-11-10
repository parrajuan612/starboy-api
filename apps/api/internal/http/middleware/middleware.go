// Package middleware reúne request-id, autenticación, RBAC y rate limiting.
package middleware

import (
	"errors"
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
	"github.com/juancamiloparra/starboy-api/internal/models"
	"github.com/juancamiloparra/starboy-api/internal/platform/token"
)

const (
	ctxRequestID = "request_id"
	ctxClaims    = "auth_claims"
)

// RequestID propaga X-Request-ID (o genera uno) para correlacionar logs.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if _, err := uuid.Parse(id); err != nil { // solo se acepta un UUID: evita inyección en logs
			id = uuid.NewString()
		}
		c.Set(ctxRequestID, id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}

// Recovery convierte un panic en el error uniforme 500.
func Recovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered any) {
		response.Fail(c, apperr.Internal(fmt.Errorf("panic: %v", recovered)))
	})
}

// Auth exige un access token válido en "Authorization: Bearer <token>".
func Auth(tokens *token.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		scheme, raw, ok := strings.Cut(c.GetHeader("Authorization"), " ")
		if !ok || !strings.EqualFold(scheme, "Bearer") || strings.TrimSpace(raw) == "" {
			response.Fail(c, apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar."))
			return
		}
		claims, err := tokens.ParseAccess(strings.TrimSpace(raw))
		if err != nil {
			if errors.Is(err, token.ErrExpired) {
				response.Fail(c, apperr.New(apperr.KindUnauthorized, "TOKEN_EXPIRED", "Tu sesión venció. Inicia sesión de nuevo."))
				return
			}
			response.Fail(c, apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar."))
			return
		}
		c.Set(ctxClaims, claims)
		c.Next()
	}
}

// RequireRole permite el paso solo a los roles indicados. Va después de Auth.
func RequireRole(roles ...models.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims, ok := Claims(c)
		if !ok {
			response.Fail(c, apperr.New(apperr.KindUnauthorized, "UNAUTHORIZED", "Inicia sesión para continuar."))
			return
		}
		for _, r := range roles {
			if claims.Role == r {
				c.Next()
				return
			}
		}
		response.Fail(c, apperr.New(apperr.KindForbidden, "FORBIDDEN", "No tienes permiso para hacer esto."))
	}
}

// Claims devuelve la identidad autenticada de la solicitud.
func Claims(c *gin.Context) (*token.Claims, bool) {
	v, ok := c.Get(ctxClaims)
	if !ok {
		return nil, false
	}
	claims, ok := v.(*token.Claims)
	return claims, ok
}
