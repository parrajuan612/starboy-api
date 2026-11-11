package payments

import (
	"fmt"
	"strings"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

// Deps son los datos de configuración que pueden necesitar las pasarelas al crearse.
type Deps struct {
	WebhookSecret string // secreto HMAC del sandbox
	WebBaseURL    string // base pública de la web (para las URL de retorno y de la pasarela de pruebas)
	Production    bool
}

// Build crea las pasarelas habilitadas (PAYMENT_PROVIDERS). ESTE es el único lugar donde se registra una
// pasarela nueva: agrega un `case` con su constructor (ver README.md de este paquete).
func Build(names []string, d Deps) ([]Provider, error) {
	var out []Provider
	seen := map[models.PaymentProvider]bool{}
	for _, raw := range names {
		name := models.PaymentProvider(strings.ToUpper(strings.TrimSpace(raw)))
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		switch name {
		case models.ProviderSandbox:
			if d.Production {
				return nil, fmt.Errorf("la pasarela SANDBOX no puede habilitarse en producción")
			}
			out = append(out, NewSandbox(d.WebhookSecret, d.WebBaseURL))
		// case models.ProviderMercadoPago:
		//     out = append(out, NewMercadoPago(...))   // ← aquí se conecta Mercado Pago (u otra pasarela)
		default:
			return nil, fmt.Errorf("pasarela %q no implementada: ver internal/platform/payments/README.md", name)
		}
	}
	return out, nil
}
