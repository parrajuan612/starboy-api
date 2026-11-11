package payments

import (
	"strings"
	"testing"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

func TestBuildHabilitaSoloLoSolicitado(t *testing.T) {
	ps, err := Build([]string{"sandbox", " SANDBOX "}, Deps{WebhookSecret: "x", WebBaseURL: "http://localhost"})
	if err != nil || len(ps) != 1 || ps[0].Name() != models.ProviderSandbox {
		t.Fatalf("debe habilitar el sandbox una sola vez: %v %v", ps, err)
	}
	if ps, err := Build(nil, Deps{}); err != nil || len(ps) != 0 {
		t.Fatalf("sin pasarelas configuradas no hay error, hay cero pasarelas: %v %v", ps, err)
	}
}

func TestBuildProhibeSandboxEnProduccion(t *testing.T) {
	if _, err := Build([]string{"SANDBOX"}, Deps{Production: true}); err == nil {
		t.Fatal("el sandbox no puede habilitarse en producción")
	}
}

func TestBuildRechazaPasarelasSinAdaptador(t *testing.T) {
	_, err := Build([]string{"MERCADOPAGO"}, Deps{})
	if err == nil || !strings.Contains(err.Error(), "README") {
		t.Fatalf("debe decir que falta el adaptador y dónde ver cómo: %v", err)
	}
}
