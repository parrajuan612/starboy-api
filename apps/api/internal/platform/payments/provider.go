// Package payments define el contrato de las pasarelas de pago (SSD §8.1: PaymentProvider).
// Hoy solo existe la pasarela simulada (sandbox); Mercado Pago implementará la misma interfaz.
package payments

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

// Outcome es el resultado que reporta la pasarela.
type Outcome string

const (
	OutcomeApproved Outcome = "approved"
	OutcomeDeclined Outcome = "declined"
)

// Event es una notificación de la pasarela ya autenticada (firma verificada).
type Event struct {
	ProviderRef string
	Outcome     Outcome
	AmountCOP   int64
	Raw         []byte // cuerpo original, para auditoría
}

// CheckoutInput es lo que la pasarela necesita para abrir un cobro.
type CheckoutInput struct {
	PaymentID   uuid.UUID
	AmountCOP   int64
	Description string
}

// CheckoutResult identifica el cobro en la pasarela y a dónde enviar al cliente.
type CheckoutResult struct {
	ProviderRef string
	CheckoutURL string
}

var (
	// ErrInvalidSignature: firma ausente, mal formada, incorrecta o con marca de tiempo vencida.
	ErrInvalidSignature = errors.New("firma inválida")
	// ErrInvalidPayload: la firma es válida pero el cuerpo no tiene el formato esperado.
	ErrInvalidPayload = errors.New("cuerpo del webhook inválido")
)

// Provider abstrae una pasarela de pago.
type Provider interface {
	Name() models.PaymentProvider
	CreateCheckout(ctx context.Context, in CheckoutInput) (CheckoutResult, error)
	CheckoutURL(providerRef string) string
	// ParseWebhook verifica la autenticidad del mensaje y lo convierte en Event.
	ParseWebhook(h http.Header, body []byte, now time.Time) (*Event, error)
}
