package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

const (
	// SandboxTolerance es cuánto se admite de diferencia entre X-Timestamp y el reloj del servidor.
	SandboxTolerance = 5 * time.Minute

	headerSignature = "X-Signature"
	headerTimestamp = "X-Timestamp"
)

// Sandbox simula una pasarela. Firma sus webhooks con HMAC-SHA256 como lo haría una real:
//
//	X-Timestamp: <unix segundos>
//	X-Signature: sha256=hex(HMAC(secret, timestamp + "." + cuerpo))
//
// NUNCA debe habilitarse en producción: cualquiera que conozca el secreto "pagaría" sin dinero.
type Sandbox struct {
	secret     []byte
	webBaseURL string
}

// NewSandbox crea la pasarela simulada.
func NewSandbox(secret, webBaseURL string) *Sandbox {
	return &Sandbox{secret: []byte(secret), webBaseURL: strings.TrimRight(webBaseURL, "/")}
}

func (s *Sandbox) Name() models.PaymentProvider { return models.ProviderSandbox }

func (s *Sandbox) CreateCheckout(_ context.Context, in CheckoutInput) (CheckoutResult, error) {
	ref := "SBX-" + strings.ReplaceAll(uuid.NewString(), "-", "")
	return CheckoutResult{ProviderRef: ref, CheckoutURL: s.CheckoutURL(ref)}, nil
}

func (s *Sandbox) CheckoutURL(ref string) string { return s.webBaseURL + "/pago/sandbox/" + ref }

// Sign calcula la firma que debe acompañar a un webhook (útil para pruebas y para el simulador).
func (s *Sandbox) Sign(timestamp string, body []byte) string {
	return "sha256=" + hex.EncodeToString(mac(s.secret, timestamp, body))
}

func mac(secret []byte, timestamp string, body []byte) []byte {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(timestamp))
	m.Write([]byte("."))
	m.Write(body)
	return m.Sum(nil)
}

type sandboxPayload struct {
	ProviderRef string `json:"provider_ref"`
	Status      string `json:"status"`
	AmountCOP   int64  `json:"amount_cop"`
}

func (s *Sandbox) ParseWebhook(h http.Header, body []byte, now time.Time) (*Event, error) {
	ts := h.Get(headerTimestamp)
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return nil, ErrInvalidSignature
	}
	if d := now.Sub(time.Unix(sec, 0)); d > SandboxTolerance || d < -SandboxTolerance {
		return nil, ErrInvalidSignature // evita repetir un mensaje capturado tiempo atrás
	}
	got, ok := strings.CutPrefix(h.Get(headerSignature), "sha256=")
	if !ok {
		return nil, ErrInvalidSignature
	}
	gotBytes, err := hex.DecodeString(got)
	if err != nil || !hmac.Equal(gotBytes, mac(s.secret, ts, body)) { // comparación en tiempo constante
		return nil, ErrInvalidSignature
	}

	var p sandboxPayload
	if err := json.Unmarshal(body, &p); err != nil || p.ProviderRef == "" || p.AmountCOP <= 0 {
		return nil, ErrInvalidPayload
	}
	var out Outcome
	switch p.Status {
	case "approved":
		out = OutcomeApproved
	case "declined":
		out = OutcomeDeclined
	default:
		return nil, ErrInvalidPayload
	}
	return &Event{ProviderRef: p.ProviderRef, Outcome: out, AmountCOP: p.AmountCOP, Raw: append([]byte(nil), body...)}, nil
}
