package payments

import (
	"errors"
	"net/http"
	"strconv"
	"testing"
	"time"
)

func headers(sb *Sandbox, at time.Time, body []byte) http.Header {
	ts := strconv.FormatInt(at.Unix(), 10)
	h := http.Header{}
	h.Set("X-Timestamp", ts)
	h.Set("X-Signature", sb.Sign(ts, body))
	return h
}

func TestSandboxParseWebhook(t *testing.T) {
	sb := NewSandbox("secreto-de-pruebas-de-al-menos-32-caracteres", "http://localhost:3000")
	now := time.Now()
	body := []byte(`{"provider_ref":"SBX-1","status":"approved","amount_cop":403000}`)

	ev, err := sb.ParseWebhook(headers(sb, now, body), body, now)
	if err != nil || ev.ProviderRef != "SBX-1" || ev.Outcome != OutcomeApproved || ev.AmountCOP != 403000 {
		t.Fatalf("firma válida debe aceptarse: %+v %v", ev, err)
	}

	tests := []struct {
		name string
		h    func() http.Header
		body []byte
		want error
	}{
		{"cuerpo alterado", func() http.Header { return headers(sb, now, body) }, []byte(`{"provider_ref":"SBX-1","status":"approved","amount_cop":1}`), ErrInvalidSignature},
		{"sin firma", func() http.Header { h := headers(sb, now, body); h.Del("X-Signature"); return h }, body, ErrInvalidSignature},
		{"firma de otro secreto", func() http.Header {
			return headers(NewSandbox("otro-secreto-distinto-de-32-caracteres!!", ""), now, body)
		}, body, ErrInvalidSignature},
		{"marca de tiempo vencida", func() http.Header { return headers(sb, now.Add(-10*time.Minute), body) }, body, ErrInvalidSignature},
		{"sin marca de tiempo", func() http.Header { h := headers(sb, now, body); h.Del("X-Timestamp"); return h }, body, ErrInvalidSignature},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := sb.ParseWebhook(tc.h(), tc.body, now); !errors.Is(err, tc.want) {
				t.Errorf("got %v, want %v", err, tc.want)
			}
		})
	}

	bad := []byte(`{"provider_ref":"SBX-1","status":"quizas","amount_cop":5}`)
	if _, err := sb.ParseWebhook(headers(sb, now, bad), bad, now); !errors.Is(err, ErrInvalidPayload) {
		t.Errorf("estado desconocido con firma válida debe ser payload inválido, got %v", err)
	}
}
