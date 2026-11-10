package middleware

import (
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
	"github.com/juancamiloparra/starboy-api/internal/http/response"
)

type window struct {
	count int
	reset time.Time
}

// RateLimit limita solicitudes por IP en ventanas fijas (en memoria; suficiente para una sola instancia).
// Crea un limitador independiente por llamada: úsalo en login/registro (SSD §13).
func RateLimit(max int, per time.Duration) gin.HandlerFunc {
	var (
		mu        sync.Mutex
		hits      = map[string]*window{}
		lastSweep = time.Now()
	)
	return func(c *gin.Context) {
		now := time.Now()
		ip := c.ClientIP()

		mu.Lock()
		if now.Sub(lastSweep) > per { // limpieza perezosa: la memoria no crece sin límite
			for k, w := range hits {
				if now.After(w.reset) {
					delete(hits, k)
				}
			}
			lastSweep = now
		}
		w, ok := hits[ip]
		if !ok || now.After(w.reset) {
			w = &window{reset: now.Add(per)}
			hits[ip] = w
		}
		w.count++
		over := w.count > max
		retry := int(time.Until(w.reset).Seconds()) + 1
		mu.Unlock()

		if over {
			c.Header("Retry-After", strconv.Itoa(retry))
			response.Fail(c, apperr.New(apperr.KindTooManyRequests, "TOO_MANY_REQUESTS",
				"Demasiados intentos. Espera un momento e inténtalo de nuevo."))
			return
		}
		c.Next()
	}
}
