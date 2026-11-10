package importreq

import (
	"testing"

	"github.com/juancamiloparra/starboy-api/internal/domain/settings"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

var params = settings.Params{
	ExchangeRateCOP: 4200, TaxExemptThresholdUSD: 200, TariffPercent: 10, VATPercent: 19,
	ServiceFeePercent: 12, ServiceFeeMinCOP: 35000, DefaultDepositPercent: 50, QuoteValidityHours: 48,
}

func rate(flat int64) models.ImportRate { return models.ImportRate{FlatFeeCOP: flat} }

func TestCalculate(t *testing.T) {
	tests := []struct {
		name  string
		lines []Line
		want  Breakdown
	}{
		{
			name:  "bajo el umbral: sin impuestos",
			lines: []Line{{PriceUSDCents: 15000, Quantity: 1, Rate: rate(100000)}},
			// producto 630.000 · logística 100.000 · comisión 75.600 · total 805.600 -> 806.000
			want: Breakdown{FOBUSDCents: 15000, ProductCOP: 630000, LogisticsCOP: 100000, ServiceFeeCOP: 75600,
				TotalCOP: 806000, DepositPct: 50, DepositCOP: 403000, BalanceCOP: 403000},
		},
		{
			name:  "justo en el umbral (200 USD): sigue exento",
			lines: []Line{{PriceUSDCents: 20000, Quantity: 1, Rate: rate(0)}},
			want: Breakdown{FOBUSDCents: 20000, ProductCOP: 840000, ServiceFeeCOP: 100800,
				TotalCOP: 941000, DepositPct: 50, DepositCOP: 470500, BalanceCOP: 470500},
		},
		{
			name:  "sobre el umbral: arancel + IVA (29 %)",
			lines: []Line{{PriceUSDCents: 25000, Quantity: 1, Rate: rate(100000)}},
			// producto 1.050.000 · logística 100.000 · comisión 126.000 · impuestos 304.500 = 1.580.500 -> 1.581.000
			want: Breakdown{FOBUSDCents: 25000, ProductCOP: 1050000, LogisticsCOP: 100000, ServiceFeeCOP: 126000,
				TaxesCOP: 304500, TaxesApplied: true, TotalCOP: 1581000, DepositPct: 50, DepositCOP: 790500, BalanceCOP: 790500},
		},
		{
			name:  "comisión mínima",
			lines: []Line{{PriceUSDCents: 2000, Quantity: 1, Rate: rate(0)}},
			// 84.000 · 12 % = 10.080 < 35.000 -> 35.000 · total 119.000
			want: Breakdown{FOBUSDCents: 2000, ProductCOP: 84000, ServiceFeeCOP: 35000,
				TotalCOP: 119000, DepositPct: 50, DepositCOP: 59500, BalanceCOP: 59500},
		},
		{
			name: "cantidad, envío interno y dos categorías; el umbral usa el FOB total",
			lines: []Line{
				{PriceUSDCents: 8000, USShippingUSDCents: 1000, Quantity: 2, Rate: rate(100000)}, // 180 USD
				{PriceUSDCents: 3000, Quantity: 1, Rate: rate(40000)},                            // 30 USD
			},
			// FOB 210 USD > 200 -> impuestos. producto 882.000 · logística 240.000 · comisión 105.840 · imp. 255.780
			want: Breakdown{FOBUSDCents: 21000, ProductCOP: 882000, LogisticsCOP: 240000, ServiceFeeCOP: 105840,
				TaxesCOP: 255780, TaxesApplied: true, TotalCOP: 1484000, DepositPct: 50, DepositCOP: 742000, BalanceCOP: 742000},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Calculate(tc.lines, params)
			if got.ManualQuote {
				t.Fatal("no debía pedir cotización manual")
			}
			if got.Breakdown != tc.want {
				t.Errorf("\n got %+v\nwant %+v", got.Breakdown, tc.want)
			}
			if got.Breakdown.DepositCOP+got.Breakdown.BalanceCOP != got.Breakdown.TotalCOP {
				t.Error("anticipo + saldo debe ser igual al total")
			}
		})
	}
}

func TestCalculate_ManualQuote(t *testing.T) {
	manual := models.ImportRate{RequiresManualQuote: true}
	if !Calculate([]Line{{PriceUSDCents: 1000, Quantity: 1, Rate: manual}}, params).ManualQuote {
		t.Error("categoría manual debe devolver cotización personalizada")
	}
	capped := models.ImportRate{MaxDeclaredUSDCents: 10000}
	if !Calculate([]Line{{PriceUSDCents: 6000, Quantity: 2, Rate: capped}}, params).ManualQuote {
		t.Error("superar el tope declarado debe devolver cotización personalizada")
	}
	if Calculate([]Line{{PriceUSDCents: 5000, Quantity: 2, Rate: capped}}, params).ManualQuote {
		t.Error("justo en el tope no es manual")
	}
}

func TestCalculate_CustomDeposit(t *testing.T) {
	p := params
	p.DefaultDepositPercent = 70
	b := Calculate([]Line{{PriceUSDCents: 2000, Quantity: 1, Rate: rate(0)}}, p).Breakdown
	if b.DepositCOP != 83300 || b.BalanceCOP != 35700 {
		t.Errorf("anticipo 70 %%: got %d / %d", b.DepositCOP, b.BalanceCOP)
	}
}

func TestCalculateWithOptions_AdminLogisticsOverride(t *testing.T) {
	manual := models.ImportRate{RequiresManualQuote: true}
	lines := []Line{{PriceUSDCents: 15000, Quantity: 1, Rate: manual}}
	if !Calculate(lines, params).ManualQuote {
		t.Fatal("sin opciones debe seguir pidiendo cotización manual")
	}
	fee := int64(250000)
	res := CalculateWithOptions(lines, params, Options{AllowManual: true, LogisticsCOP: &fee})
	if res.ManualQuote {
		t.Fatal("con AllowManual debe calcular")
	}
	// producto 630.000 · logística 250.000 (fijada por el admin) · comisión 75.600 = 955.600 -> 956.000
	if b := res.Breakdown; b.LogisticsCOP != 250000 || b.TotalCOP != 956000 || b.DepositCOP != 478000 {
		t.Errorf("got %+v", b)
	}
}
