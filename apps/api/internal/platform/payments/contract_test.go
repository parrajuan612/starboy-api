package payments_test

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/juancamiloparra/starboy-api/internal/platform/payments"
	"github.com/juancamiloparra/starboy-api/internal/platform/payments/providertest"
)

// El sandbox es la implementación de referencia del contrato: un adaptador nuevo copia esta forma.
func TestSandboxCumpleElContrato(t *testing.T) {
	s := payments.NewSandbox("secreto-de-prueba-de-32-caracteres!", "https://tienda.example")
	signed := func(at time.Time) providertest.Webhook {
		return func(ref string, out payments.Outcome, amount int64) (http.Header, []byte) {
			body, _ := json.Marshal(map[string]any{"provider_ref": ref, "status": string(out), "amount_cop": amount})
			ts := strconv.FormatInt(at.Unix(), 10)
			return http.Header{"X-Timestamp": {ts}, "X-Signature": {s.Sign(ts, body)}}, body
		}
	}
	providertest.Run(t, providertest.Harness{
		Provider: s,
		Webhook:  signed(time.Now()),
		Stale:    signed(time.Now().Add(-2 * time.Hour)),
	})
}
