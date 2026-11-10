package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func limited(t *testing.T, trusted []string) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	require.NoError(t, r.SetTrustedProxies(trusted))
	r.GET("/x", RateLimit(2, time.Minute), func(c *gin.Context) { c.String(200, c.ClientIP()) })
	return r
}

func hit(r *gin.Engine, remote, xff string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.RemoteAddr = remote
	if xff != "" {
		req.Header.Set("X-Forwarded-For", xff)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// Detrás de un proxy de confianza cada cliente real tiene su propio cupo.
func TestRateLimit_PerRealClientBehindTrustedProxy(t *testing.T) {
	r := limited(t, []string{"10.0.0.0/8"})
	for i := 0; i < 2; i++ {
		assert.Equal(t, 200, hit(r, "10.0.0.5:1234", "203.0.113.7").Code)
	}
	assert.Equal(t, 429, hit(r, "10.0.0.5:1234", "203.0.113.7").Code, "el cliente A agotó su cupo")
	w := hit(r, "10.0.0.5:1234", "203.0.113.8")
	assert.Equal(t, 200, w.Code, "el cliente B no comparte el cupo de A")
	assert.Equal(t, "203.0.113.8", w.Body.String())
}

// Cadena Caddy -> Next -> API: se salta a todos los proxies de confianza y se toma al cliente.
func TestRateLimit_ProxyChain(t *testing.T) {
	r := limited(t, []string{"10.0.0.0/8"})
	w := hit(r, "10.0.0.9:1", "198.51.100.4, 10.0.0.2")
	assert.Equal(t, "198.51.100.4", w.Body.String())
}

// Quien no es proxy de confianza no puede falsear su IP para obtener un cupo nuevo en cada llamada.
func TestRateLimit_UntrustedPeerCannotSpoof(t *testing.T) {
	r := limited(t, []string{"10.0.0.0/8"})
	assert.Equal(t, 200, hit(r, "192.0.2.1:1", "1.1.1.1").Code)
	assert.Equal(t, 200, hit(r, "192.0.2.1:1", "2.2.2.2").Code)
	assert.Equal(t, 429, hit(r, "192.0.2.1:1", "3.3.3.3").Code)
}

// Un cliente que falsea X-Forwarded-For detrás del proxy queda a la izquierda de la IP real y se ignora.
func TestRateLimit_SpoofedLeftEntryIgnored(t *testing.T) {
	r := limited(t, []string{"10.0.0.0/8"})
	assert.Equal(t, "198.51.100.4", hit(r, "10.0.0.9:1", "9.9.9.9, 198.51.100.4").Body.String())
}
