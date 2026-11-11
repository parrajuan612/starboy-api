"use client";

import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { Alert, Button, Field, TextAreaField } from "@/components/ui";
import { isApiError } from "@/lib/api-client";
import { createRate, listRates, updateRate } from "@/lib/catalog-admin";
import { formatCOP, formatUSD } from "@/lib/format";
import { focusFirstInvalid, type FieldErrors } from "@/lib/forms";
import { parseCOP, parseCount } from "@/lib/product-status";
import type { AdminRate, RateInput } from "@/types";

interface Form {
  name: string;
  avg_weight_lb: string;
  freight_cop: string;
  handling_cop: string;
  insurance_cop: string;
  national_delivery_cop: string;
  margin_cop: string;
  max_declared_usd: string;
  requires_manual_quote: boolean;
  notes: string;
  is_active: boolean;
  sort_order: string;
}

const EMPTY: Form = { name: "", avg_weight_lb: "0", freight_cop: "0", handling_cop: "0", insurance_cop: "0", national_delivery_cop: "0", margin_cop: "0", max_declared_usd: "0", requires_manual_quote: false, notes: "", is_active: true, sort_order: "0" };

const toForm = (r: AdminRate): Form => ({
  name: r.name, avg_weight_lb: String(r.avg_weight_lb), freight_cop: String(r.freight_cop), handling_cop: String(r.handling_cop), insurance_cop: String(r.insurance_cop),
  national_delivery_cop: String(r.national_delivery_cop), margin_cop: String(r.margin_cop), max_declared_usd: String(r.max_declared_usd_cents / 100),
  requires_manual_quote: r.requires_manual_quote, notes: r.notes ?? "", is_active: r.is_active, sort_order: String(r.sort_order),
});

const COMPONENTS = [
  ["freight_cop", "Flete internacional", "Lo que cobra el courier por traer el producto."],
  ["handling_cop", "Manejo", "Costo de recibir y gestionar el paquete."],
  ["insurance_cop", "Seguro", ""],
  ["national_delivery_cop", "Entrega nacional", "Del puerto de entrada hasta la puerta del cliente."],
  ["margin_cop", "Margen de Starboy", "Lo que ganas por el servicio logístico."],
] as const;

/** Tarifa fija por categoría de encargo (SSD §10.8): la suma de cinco componentes es lo que ve el cliente como «Envío internacional y logística». */
export function RatesAdmin() {
  const [rates, setRates] = useState<AdminRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminRate | "new" | null>(null);

  const load = useCallback(() => {
    listRates().then(setRates).catch((e) => setError(isApiError(e) ? e.message : "No pudimos cargar las tarifas."));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="body text-ink-muted max-w-xl">Cada categoría de encargo tiene una tarifa de logística. Mientras estén en $0, la calculadora y las cotizaciones no cobran envío internacional.</p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Nueva categoría
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {!rates && !error && (
        <p role="status" className="body text-ink-muted flex items-center gap-2">
          <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando…
        </p>
      )}
      {rates && (
        <ul aria-label="Tarifas por categoría" className="divide-line bg-surface-raised border-line divide-y border">
          {rates.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setEditing(r)} className="hover:bg-surface flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4 text-left">
                <span className="min-w-0">
                  <span className="body-strong block">{r.name}</span>
                  <span className="body-sm text-ink-muted block">
                    {r.requires_manual_quote ? "Cotización personalizada" : r.flat_fee_cop === 0 ? "Sin tarifa cargada" : `Logística ${formatCOP(r.flat_fee_cop)}`}
                    {r.max_declared_usd_cents > 0 && ` · hasta ${formatUSD(r.max_declared_usd_cents)}`}
                  </span>
                </span>
                {!r.is_active && <span className="sb-badge sb-badge--neutral">Inactiva</span>}
                {r.is_active && !r.requires_manual_quote && r.flat_fee_cop === 0 && <span className="sb-badge sb-badge--danger">Falta tarifa</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <AdminDrawer open={editing !== null} title={editing === "new" ? "Nueva categoría de encargo" : (editing?.name ?? "")} onClose={() => setEditing(null)}>
        {editing && (
          <RateForm
            key={editing === "new" ? "new" : editing.id}
            rate={editing === "new" ? undefined : editing}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </AdminDrawer>
    </div>
  );
}

function RateForm({ rate, onSaved }: { rate?: AdminRate; onSaved: () => void }) {
  const [f, setF] = useState<Form>(rate ? toForm(rate) : EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const total = COMPONENTS.reduce((sum, [k]) => sum + (parseCOP(f[k]) ?? 0), 0);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const errs: FieldErrors = {};
    const money: Partial<Record<(typeof COMPONENTS)[number][0], number>> = {};
    for (const [k, label] of COMPONENTS) {
      const n = parseCOP(f[k]);
      if (n === null) errs[k] = `Escribe ${label.toLowerCase()} en pesos.`;
      else money[k] = n;
    }
    const weight = Number(f.avg_weight_lb.replace(",", "."));
    if (f.name.trim().length < 2) errs.name = "Escribe el nombre (mínimo 2 caracteres).";
    if (!Number.isFinite(weight) || weight < 0 || weight > 9999) errs.avg_weight_lb = "Escribe el peso en libras, por ejemplo 2.5.";
    const maxUsd = Number(f.max_declared_usd.replace(",", "."));
    if (!Number.isFinite(maxUsd) || maxUsd < 0) errs.max_declared_usd = "Escribe un monto en dólares (0 = sin tope).";
    const order = parseCount(f.sort_order);
    if (order === null || order > 10000) errs.sort_order = "Número entero, de 0 a 10000.";
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) {
      focusFirstInvalid(ref.current);
      return;
    }
    const input: RateInput = {
      name: f.name.trim(), avg_weight_lb: weight, freight_cop: money.freight_cop!, handling_cop: money.handling_cop!, insurance_cop: money.insurance_cop!,
      national_delivery_cop: money.national_delivery_cop!, margin_cop: money.margin_cop!, max_declared_usd_cents: Math.round(maxUsd * 100),
      requires_manual_quote: f.requires_manual_quote, notes: f.notes.trim(), is_active: f.is_active, sort_order: order!,
    };
    setBusy(true);
    try {
      if (rate) await updateRate(rate.id, input);
      else await createRate(input);
      onSaved();
      return;
    } catch (e) {
      if (isApiError(e)) {
        setErrors(e.fieldErrors);
        if (Object.keys(e.fieldErrors).length === 0) setFormError(e.message);
        else focusFirstInvalid(ref.current);
      } else setFormError("Algo salió mal. Inténtalo de nuevo.");
    }
    setBusy(false);
  }

  return (
    <form ref={ref} onSubmit={submit} noValidate className="space-y-5">
      {formError && <Alert>{formError}</Alert>}
      <Field label="Nombre de la categoría" name="name" required autoComplete="off" value={f.name} onChange={set("name")} error={errors.name} hint="Ej.: Tenis / sneakers (con caja)" />
      <Field label="Peso promedio (lb)" name="avg_weight_lb" inputMode="decimal" autoComplete="off" value={f.avg_weight_lb} onChange={set("avg_weight_lb")} error={errors.avg_weight_lb} hint="Solo informativo, para calcular el flete." />
      <fieldset className="space-y-4">
        <legend className="sb-label">Componentes de la tarifa (COP)</legend>
        {COMPONENTS.map(([k, label, hint]) => (
          <Field key={k} label={label} name={k} inputMode="numeric" autoComplete="off" value={f[k]} onChange={set(k)} error={errors[k]} hint={hint || (parseCOP(f[k]) ? formatCOP(parseCOP(f[k])!) : undefined)} />
        ))}
        <p className="bg-surface body flex items-baseline justify-between gap-4 p-4" aria-live="polite">
          <span className="body-strong">Tarifa de logística que ve el cliente</span>
          <span className="price-lg tabular-nums">{formatCOP(total)}</span>
        </p>
      </fieldset>
      <Field label="Valor máximo declarado (USD)" name="max_declared_usd" inputMode="decimal" autoComplete="off" value={f.max_declared_usd} onChange={set("max_declared_usd")} error={errors.max_declared_usd} hint="Tope por artículo para esta categoría. 0 = sin tope." />
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" checked={f.requires_manual_quote} onChange={(e) => setF((v) => ({ ...v, requires_manual_quote: e.target.checked }))} className="mt-1 size-5" />
        <span className="body">Siempre se cotiza a la medida (la calculadora no muestra total)</span>
      </label>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" checked={f.is_active} onChange={(e) => setF((v) => ({ ...v, is_active: e.target.checked }))} className="mt-1 size-5" />
        <span className="body">Activa (los clientes pueden elegirla)</span>
      </label>
      <Field label="Orden en la lista" name="sort_order" inputMode="numeric" autoComplete="off" value={f.sort_order} onChange={set("sort_order")} error={errors.sort_order} />
      <TextAreaField label="Nota para el cliente" name="notes" maxLength={1000} value={f.notes} onChange={set("notes")} error={errors.notes} hint="Ej.: las baterías de litio pueden tener restricciones." />
      <Button type="submit" loading={busy} className="w-full sm:w-auto">
        {rate ? "Guardar cambios" : "Crear categoría"}
      </Button>
    </form>
  );
}
