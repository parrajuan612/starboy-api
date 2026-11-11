// Package providertest es la suite de contrato de las pasarelas de pago: cualquier adaptador nuevo
// (Mercado Pago, Wompi, ePayco…) debe pasarla antes de habilitarse. Garantiza lo que el resto del
// sistema da por hecho: referencia estable, URL derivable de la referencia, y webhooks que no se
// aceptan sin firma válida.
//
// Uso, en el paquete payments (archivo *_test.go del adaptador):
//
//	func TestMiPasarelaCumpleElContrato(t *testing.T) {
//	    providertest.Run(t, providertest.Harness{Provider: p, Webhook: firmar, Stale: firmarViejo})
//	}
package providertest

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/models"
	"github.com/juancamiloparra/starboy-api/internal/platform/payments"
)

// Webhook fabrica un mensaje de la pasarela tal como lo enviaría (cabeceras + cuerpo), con firma válida.
type Webhook func(ref string, outcome payments.Outcome, amountCOP int64) (http.Header, []byte)

// Harness conecta la suite con el adaptador que se prueba.
type Harness struct {
	Provider payments.Provider
	// Webhook produce mensajes VÁLIDOS y firmados.
	Webhook Webhook
	// Stale (opcional) produce un mensaje con firma correcta pero marca de tiempo vieja (≥ 1 h). Si la pasarela
	// protege contra repeticiones, ParseWebhook debe rechazarlo. Déjalo nil si no aplica.
	Stale Webhook
}

// Run ejecuta todas las comprobaciones.
func Run(t *testing.T, h Harness) {
	t.Helper()
	if h.Provider == nil || h.Webhook == nil {
		t.Fatal("Harness necesita Provider y Webhook")
	}
	p := h.Provider
	now := time.Now()

	t.Run("nombre válido", func(t *testing.T) {
		switch p.Name() {
		case models.ProviderMercadoPago, models.ProviderSandbox, models.ProviderBankTransfer, models.ProviderCashOnDelivery:
		default:
			t.Fatalf("Name() = %q no está en la restricción chk_payments_provider", p.Name())
		}
	})

	var ref string
	t.Run("crear cobro", func(t *testing.T) {
		in := payments.CheckoutInput{
			PaymentID: uuid.New(), AmountCOP: 403_000, Description: "Orden SB-000001", Reference: "SB-000001",
			ReturnURL: "https://tienda.example/pago/retorno?pid=x", NotifyURL: "https://api.example/api/v1/payments/webhook/x",
		}
		res, err := p.CreateCheckout(context.Background(), in)
		if err != nil {
			t.Fatalf("CreateCheckout: %v", err)
		}
		if res.ProviderRef == "" || len(res.ProviderRef) > 120 {
			t.Fatalf("ProviderRef debe tener entre 1 y 120 caracteres (columna varchar(120) única): %q", res.ProviderRef)
		}
		if res.CheckoutURL == "" {
			t.Fatal("CheckoutURL vacío: el cliente no tendría a dónde ir")
		}
		if got := p.CheckoutURL(res.ProviderRef); got != res.CheckoutURL {
			t.Fatalf("CheckoutURL(ref) debe poder reconstruirse solo con la referencia (se usa al leer un pago pendiente): %q != %q", got, res.CheckoutURL)
		}
		ref = res.ProviderRef
		other, _ := p.CreateCheckout(context.Background(), payments.CheckoutInput{PaymentID: uuid.New(), AmountCOP: 1000})
		if other.ProviderRef == ref {
			t.Fatal("dos cobros distintos no pueden compartir referencia")
		}
	})
	if ref == "" {
		t.Fatal("sin referencia no se puede seguir")
	}

	t.Run("webhook aprobado y rechazado", func(t *testing.T) {
		for _, out := range []payments.Outcome{payments.OutcomeApproved, payments.OutcomeDeclined} {
			hd, body := h.Webhook(ref, out, 403_000)
			ev, err := p.ParseWebhook(hd, body, now)
			if err != nil {
				t.Fatalf("%s: %v", out, err)
			}
			if ev.ProviderRef != ref || ev.Outcome != out || ev.AmountCOP != 403_000 {
				t.Fatalf("%s: evento mal interpretado: %+v", out, ev)
			}
			if len(ev.Raw) == 0 {
				t.Fatalf("%s: Raw vacío (se guarda para auditoría)", out)
			}
		}
	})

	t.Run("rechaza cuerpo alterado", func(t *testing.T) {
		hd, body := h.Webhook(ref, payments.OutcomeApproved, 403_000)
		tampered := bytes.Replace(body, []byte("403000"), []byte("1"), 1)
		if bytes.Equal(tampered, body) { // el formato no usa ese literal: se altera el último byte
			tampered = append(append([]byte{}, body[:len(body)-1]...), body[len(body)-1]^0x01)
		}
		if _, err := p.ParseWebhook(hd, tampered, now); !errors.Is(err, payments.ErrInvalidSignature) {
			t.Fatalf("un cuerpo alterado debe dar ErrInvalidSignature, dio %v", err)
		}
	})

	t.Run("rechaza mensaje sin firma", func(t *testing.T) {
		_, body := h.Webhook(ref, payments.OutcomeApproved, 403_000)
		if _, err := p.ParseWebhook(http.Header{}, body, now); !errors.Is(err, payments.ErrInvalidSignature) {
			t.Fatalf("sin cabeceras de firma debe dar ErrInvalidSignature, dio %v", err)
		}
	})

	if h.Stale != nil {
		t.Run("rechaza mensajes viejos (repetición)", func(t *testing.T) {
			hd, body := h.Stale(ref, payments.OutcomeApproved, 403_000)
			if _, err := p.ParseWebhook(hd, body, now); !errors.Is(err, payments.ErrInvalidSignature) {
				t.Fatalf("un mensaje de hace horas debe dar ErrInvalidSignature, dio %v", err)
			}
		})
	}
}
