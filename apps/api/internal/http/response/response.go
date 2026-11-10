// Package response unifica el formato de éxito y de error de la API (SSD §11).
//
//	éxito:  { "data": ..., "meta": { ... } }
//	error:  { "error": { "code", "message", "details" } }
package response

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
)

// Meta describe la paginación.
type Meta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

// NewMeta calcula el total de páginas.
func NewMeta(page, limit int, total int64) Meta {
	pages := 0
	if limit > 0 {
		pages = int((total + int64(limit) - 1) / int64(limit))
	}
	return Meta{Page: page, Limit: limit, Total: total, TotalPages: pages}
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

// JSON responde con { "data": data }.
func JSON(c *gin.Context, status int, data any) {
	c.JSON(status, gin.H{"data": data})
}

// Paginated responde con { "data": data, "meta": meta }.
func Paginated(c *gin.Context, data any, meta Meta) {
	c.JSON(http.StatusOK, gin.H{"data": data, "meta": meta})
}

// Fail traduce cualquier error al formato uniforme y corta la cadena de handlers.
// Los errores inesperados se registran con el request-id y el cliente solo ve un mensaje genérico.
func Fail(c *gin.Context, err error) {
	ae, ok := apperr.As(err)
	if !ok {
		ae = apperr.Internal(err)
	}
	if ae.Kind == apperr.KindInternal {
		slog.Error("error interno",
			"request_id", c.GetString("request_id"),
			"path", c.FullPath(),
			"error", errors.Unwrap(ae),
			"detail", ae.Error(),
		)
	}
	c.AbortWithStatusJSON(statusOf(ae.Kind), gin.H{"error": errorBody{
		Code: ae.Code, Message: ae.Message, Details: ae.Details,
	}})
}

func statusOf(k apperr.Kind) int {
	switch k {
	case apperr.KindBadRequest:
		return http.StatusBadRequest
	case apperr.KindValidation:
		return http.StatusUnprocessableEntity
	case apperr.KindUnauthorized:
		return http.StatusUnauthorized
	case apperr.KindForbidden:
		return http.StatusForbidden
	case apperr.KindNotFound:
		return http.StatusNotFound
	case apperr.KindConflict:
		return http.StatusConflict
	case apperr.KindTooManyRequests:
		return http.StatusTooManyRequests
	default:
		return http.StatusInternalServerError
	}
}
