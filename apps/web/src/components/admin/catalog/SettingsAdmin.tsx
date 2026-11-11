"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { RatesAdmin } from "@/components/admin/catalog/RatesAdmin";
import { Alert, Button, Field } from "@/components/ui";
import { isApiError } from "@/lib/api-client";
import { getSettings, saveSettings } from "@/lib/catalog-admin";
import { formatCOP } from "@/lib/format";
import { focusFirstInvalid, type FieldErrors } from "@/lib/forms";
import type { BusinessSetting } from "@/types";

type Tab = "params" | "rates";

/** Ajustes del negocio: parámetros que usan la calculadora y las cotizaciones, y tarifas por categoría de encargo. */
export function SettingsAdmin() {
  const [tab, setTab] = useState<Tab>("params");
  const base = useId();
  const tabs: { id: Tab; label: string }[] = [
    { id: "params", label: "Parámetros de encargos y envíos" },
    { id: "rates", label: "Tarifas por categoría" },
  ];
  return (
    <section aria-labelledby="set-title">
      <h1 id="set-title" className="display-md">
        Ajustes
      </h1>
      <div role="tablist" aria-label="Ajustes" className="border-line mt-6 flex overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t.id} role="tab" id={`${base}-${t.id}`} aria-selected={tab === t.id} aria-controls={`${base}-panel`} type="button" onClick={() => setTab(t.id)}
            className={`label min-h-11 border-b-2 px-4 whitespace-nowrap ${tab === t.id ? "border-brand text-ink" : "text-ink-muted hover:text-ink border-transparent"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-${tab}`} className="mt-6">
        {tab === "params" ? <Params /> : <RatesAdmin />}
      </div>
    </section>
  );
}

const UNIT: Record<string, string> = { COP: "pesos", USD: "dólares", "%": "%", h: "horas", "": "" };

function Params() {
  const [settings, setSettings] = useState<BusinessSetting[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  const apply = useCallback((list: BusinessSetting[]) => {
    setSettings(list);
    setValues(Object.fromEntries(list.map((s) => [s.key, String(s.value)])));
  }, []);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((l) => alive && apply(l))
      .catch((e) => alive && setLoadError(isApiError(e) ? e.message : "No pudimos cargar los ajustes."));
    return () => {
      alive = false;
    };
  }, [apply]);

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!settings)
    return (
      <p role="status" className="body text-ink-muted flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando…
      </p>
    );

  const changed = settings.filter((s) => values[s.key] !== String(s.value));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy || !settings) return;
    const errs: FieldErrors = {};
    const payload: Record<string, number> = {};
    for (const s of changed) {
      const raw = values[s.key].replace(/[\s.,]/g, "");
      if (!/^\d+$/.test(raw)) errs[s.key] = "Escribe un número entero.";
      else if (Number(raw) < s.min || Number(raw) > s.max) errs[s.key] = `Debe estar entre ${s.min.toLocaleString("es-CO")} y ${s.max.toLocaleString("es-CO")}.`;
      else payload[s.key] = Number(raw);
    }
    setErrors(errs);
    setFormError(null);
    setSaved(false);
    if (Object.keys(errs).length) {
      focusFirstInvalid(ref.current);
      return;
    }
    setBusy(true);
    try {
      apply(await saveSettings(payload));
      setSaved(true);
    } catch (e) {
      if (isApiError(e)) {
        const fe = e.fieldErrors;
        setErrors(fe);
        if (Object.keys(fe).length === 0) setFormError(e.message);
        else focusFirstInvalid(ref.current);
      } else setFormError("Algo salió mal. Inténtalo de nuevo.");
    }
    setBusy(false);
  }

  return (
    <form ref={ref} onSubmit={submit} noValidate className="max-w-2xl space-y-6">
      <p className="body text-ink-muted">Estos valores alimentan la calculadora pública y las cotizaciones nuevas. Las cotizaciones ya enviadas conservan los valores con los que se calcularon.</p>
      {formError && <Alert>{formError}</Alert>}
      {settings.map((s) => {
        const n = Number(values[s.key].replace(/[\s.,]/g, ""));
        return (
          <Field
            key={s.key}
            label={`${s.label}${UNIT[s.unit] && s.unit !== "%" ? ` (${UNIT[s.unit]})` : s.unit === "%" ? " (%)" : ""}`}
            name={s.key}
            required
            inputMode="numeric"
            autoComplete="off"
            value={values[s.key]}
            onChange={(e) => { setValues((v) => ({ ...v, [s.key]: e.target.value })); setSaved(false); }}
            error={errors[s.key]}
            hint={`${s.help}${s.unit === "COP" && Number.isFinite(n) && n > 0 ? ` · ${formatCOP(n)}` : ""}`}
          />
        );
      })}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={busy} disabled={changed.length === 0}>
          Guardar cambios
        </Button>
        {changed.length > 0 && <span className="body-sm text-ink-muted">{changed.length} {changed.length === 1 ? "cambio sin guardar" : "cambios sin guardar"}</span>}
        {saved && changed.length === 0 && <p role="status" className="text-success body-sm">Ajustes guardados. Ya aplican a las cotizaciones nuevas.</p>}
      </div>
    </form>
  );
}
