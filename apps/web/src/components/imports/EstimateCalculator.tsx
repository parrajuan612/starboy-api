"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, Button, ButtonLink, Field, SelectField } from "@/components/ui";
import { isApiError } from "@/lib/api-client";
import { formatCOP, formatUSD } from "@/lib/format";
import { estimateImport, getImportRates } from "@/lib/imports";
import { MAX_USD_CENTS, parseUSDToCents } from "@/lib/validators/imports";
import type { Estimate, ImportRate } from "@/types";

/**
 * Calculadora pública de Encargos USA. Muestra un ESTIMADO con los parámetros vigentes del servidor
 * (TRM, comisión, impuestos); el valor final lo fija el equipo en la cotización. Se calcula al pulsar el
 * botón (no en cada tecla) para no gastar el límite de consultas de la API.
 */
export function EstimateCalculator() {
  const [rates, setRates] = useState<ImportRate[] | null>(null);
  const [ratesError, setRatesError] = useState(false);
  const [rateId, setRateId] = useState("");
  const [price, setPrice] = useState("");
  const [shipping, setShipping] = useState("");
  const [qty, setQty] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Estimate | null>(null);

  useEffect(() => {
    let alive = true;
    getImportRates()
      .then((r) => alive && setRates(r))
      .catch(() => alive && setRatesError(true));
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    const cents = parseUSDToCents(price);
    const ship = shipping.trim() ? parseUSDToCents(shipping) : 0;
    const q = Number(qty);
    if (!rateId) errs.rate = "Elige la categoría del producto.";
    if (cents === null || cents <= 0) errs.price = "Escribe el precio en dólares, por ejemplo 129.99.";
    else if (cents > MAX_USD_CENTS) errs.price = "El precio es demasiado alto.";
    if (ship === null) errs.shipping = "Escribe un monto válido o déjalo vacío.";
    if (!Number.isInteger(q) || q < 1 || q > 50) errs.qty = "Entre 1 y 50 unidades.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("#calc-form [aria-invalid='true']")?.focus());
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await estimateImport([{ import_rate_id: rateId, price_usd_cents: cents!, us_shipping_usd_cents: ship!, quantity: q }]));
    } catch (e) {
      setResult(null);
      setError(isApiError(e) ? (e.status === 429 ? "Hiciste muchas consultas seguidas. Espera un momento e inténtalo de nuevo." : e.message) : "No pudimos calcular el estimado. Inténtalo de nuevo.");
    }
    setBusy(false);
  }

  const b = result?.breakdown;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <form id="calc-form" onSubmit={onSubmit} noValidate className="space-y-5">
        {ratesError && <Alert>No pudimos cargar las categorías. Recarga la página e inténtalo de nuevo.</Alert>}
        <SelectField label="Categoría" name="rate" required value={rateId} onChange={(e) => setRateId(e.target.value)} error={errors.rate} disabled={!rates}>
          <option value="">{rates ? "Elige una categoría" : "Cargando…"}</option>
          {rates?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>
        <Field label="Precio del producto (USD)" name="price" required inputMode="decimal" autoComplete="off" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price} hint="El precio de la tienda en EE. UU., sin impuestos. Ej.: 129.99" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Envío dentro de EE. UU. (USD)" name="shipping" inputMode="decimal" autoComplete="off" value={shipping} onChange={(e) => setShipping(e.target.value)} error={errors.shipping} hint="Por unidad, si la tienda lo cobra." />
          <Field label="Cantidad" name="qty" required inputMode="numeric" autoComplete="off" value={qty} onChange={(e) => setQty(e.target.value)} error={errors.qty} />
        </div>
        <Button type="submit" loading={busy} className="w-full sm:w-auto">
          Calcular estimado
        </Button>
      </form>

      <div aria-live="polite" className="bg-surface-raised border-line h-fit border p-5">
        <h3 className="label mb-3">Tu estimado</h3>
        {busy && (
          <p role="status" className="body text-ink-muted flex items-center gap-2">
            <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Calculando…
          </p>
        )}
        {!busy && error && <Alert>{error}</Alert>}
        {!busy && !error && !result && <p className="body text-ink-muted">Completa los datos y pulsa «Calcular estimado» para ver cuánto costaría traerlo a Colombia.</p>}
        {!busy && result?.requires_manual_quote && (
          <div className="space-y-4">
            {result.message ? (
              <p className="body">{result.message}</p> /* la API ya empieza por «Cotización personalizada: …» */
            ) : (
              <p className="body">
                <strong className="font-semibold">Cotización personalizada:</strong> esta categoría se cotiza a la medida. Envíanos el enlace y te respondemos con el valor final.
              </p>
            )}
            <ButtonLink href="/encargos-usa/cotizar">Solicitar cotización</ButtonLink>
          </div>
        )}
        {!busy && b && (
          <div className="space-y-4">
            <dl className="body space-y-2">
              <Row label={`Producto (${formatUSD(result!.fob_usd_cents)} × TRM ${formatCOP(result!.exchange_rate_cop)})`} value={formatCOP(b.product_cop)} />
              <Row label="Envío internacional y logística" value={formatCOP(b.logistics_cop)} />
              <Row label="Comisión de servicio" value={formatCOP(b.service_fee_cop)} />
              {result!.taxes_applied && <Row label="Impuestos" value={formatCOP(b.taxes_cop)} />}
              <div className="border-line flex items-baseline justify-between gap-4 border-t pt-3">
                <dt className="body-strong">Total estimado</dt>
                <dd className="price-lg tabular-nums">{formatCOP(b.total_cop)}</dd>
              </div>
            </dl>
            <dl className="body bg-surface space-y-2 p-4">
              <Row label={`Anticipo (${b.deposit_percent} %)`} value={formatCOP(b.deposit_cop)} strong />
              <Row label="Saldo al llegar a Colombia" value={formatCOP(b.balance_cop)} />
            </dl>
            {!result!.taxes_applied && <p className="caption text-ink-muted">Sin impuestos: el valor del producto está por debajo del umbral de USD {result!.tax_exempt_threshold_usd}.</p>}
            <p className="caption text-ink-muted flex items-start gap-1.5">
              <AlertCircle className="mt-px size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              Es un estimado. El valor final lo confirmamos en tu cotización, que es válida por 48 horas.
            </p>
            <ButtonLink href="/encargos-usa/cotizar" className="w-full sm:w-auto">
              Solicitar cotización
            </ButtonLink>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? "body-strong" : "text-ink-muted"}>{label}</dt>
      <dd className={`shrink-0 tabular-nums ${strong ? "body-strong" : ""}`}>{value}</dd>
    </div>
  );
}
