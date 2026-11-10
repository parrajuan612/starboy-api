// Package importreq implementa los Encargos USA: cotizador, solicitudes y rastreo (SSD §10.2–10.8).
package importreq

import (
	"github.com/juancamiloparra/starboy-api/internal/domain/settings"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

// Line es un producto a cotizar junto con la tarifa de su categoría.
type Line struct {
	PriceUSDCents      int64 // precio unitario en la tienda de EE. UU.
	USShippingUSDCents int64 // envío interno en EE. UU., por unidad (SSD §10.4)
	Quantity           int
	Rate               models.ImportRate
}

// Breakdown es el desglose en COP. Todo en enteros; nunca float para dinero.
type Breakdown struct {
	FOBUSDCents   int64 // valor declarado total (producto + envío interno), base de la exención
	ProductCOP    int64
	LogisticsCOP  int64
	ServiceFeeCOP int64
	TaxesCOP      int64
	TotalCOP      int64
	TaxesApplied  bool
	DepositPct    int64
	DepositCOP    int64
	BalanceCOP    int64
}

// Result es la salida del cotizador. Si ManualQuote es true no hay totales: la categoría
// (o el monto) exige una cotización personalizada del admin.
type Result struct {
	ManualQuote bool
	Breakdown   Breakdown
}

// Calculate aplica la fórmula del SSD §10.4 con los parámetros vigentes:
//
//	producto_cop  = Σ (precio_usd + envío_usa_usd) × cantidad × TRM
//	logística_cop = Σ flat_fee_cop × cantidad
//	comisión_cop  = max(producto_cop × fee% / 100, fee_mínima)
//	impuestos_cop = producto_cop × (arancel% + IVA%) / 100   si FOB_usd > umbral, si no 0
//	total_cop     = suma, redondeada hacia arriba a miles de pesos
//	anticipo_cop  = total_cop × anticipo% / 100;  saldo = total − anticipo
func Calculate(lines []Line, p settings.Params) Result {
	return CalculateWithOptions(lines, p, Options{})
}

// Options ajusta el cálculo cuando lo emite el admin.
type Options struct {
	AllowManual  bool   // calcula aunque la categoría pida cotización personalizada
	LogisticsCOP *int64 // reemplaza la logística calculada por las tarifas fijas
}

// CalculateWithOptions es Calculate con los ajustes del admin (cotización formal).
func CalculateWithOptions(lines []Line, p settings.Params, opts Options) Result {
	var fobCents int64
	for _, l := range lines {
		lineCents := (l.PriceUSDCents + l.USShippingUSDCents) * int64(l.Quantity)
		fobCents += lineCents
		if !opts.AllowManual && (l.Rate.RequiresManualQuote || (l.Rate.MaxDeclaredUSDCents > 0 && lineCents > l.Rate.MaxDeclaredUSDCents)) {
			return Result{ManualQuote: true}
		}
	}

	b := Breakdown{FOBUSDCents: fobCents, DepositPct: p.DefaultDepositPercent}
	b.ProductCOP = (fobCents*p.ExchangeRateCOP + 50) / 100 // centavos -> pesos, redondeo al más cercano
	for _, l := range lines {
		b.LogisticsCOP += l.Rate.FlatFeeCOP * int64(l.Quantity)
	}
	if opts.LogisticsCOP != nil {
		b.LogisticsCOP = *opts.LogisticsCOP
	}
	b.ServiceFeeCOP = max(b.ProductCOP*p.ServiceFeePercent/100, p.ServiceFeeMinCOP)

	// El umbral está en USD enteros; la exención aplica hasta el umbral inclusive.
	if fobCents > p.TaxExemptThresholdUSD*100 {
		b.TaxesApplied = true
		b.TaxesCOP = b.ProductCOP * (p.TariffPercent + p.VATPercent) / 100
	}

	total := b.ProductCOP + b.LogisticsCOP + b.ServiceFeeCOP + b.TaxesCOP
	b.TotalCOP = (total + 999) / 1000 * 1000
	b.DepositCOP = b.TotalCOP * p.DefaultDepositPercent / 100
	b.BalanceCOP = b.TotalCOP - b.DepositCOP
	return Result{Breakdown: b}
}
