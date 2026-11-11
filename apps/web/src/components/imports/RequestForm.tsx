"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert, Button, Field, SelectField, TextAreaField } from "@/components/ui";
import { isApiError } from "@/lib/api-client";
import { focusFirstInvalid, type FieldErrors } from "@/lib/forms";
import { createImport, getImportRates, importPath } from "@/lib/imports";
import { EMPTY_ITEM, MAX_ITEMS, validateRequest, type ItemForm, type RequestForm } from "@/lib/validators/imports";
import { useAuthStore } from "@/store/auth";
import type { ImportRate } from "@/types";

/** Campo del servidor → campo del formulario. */
const SERVER_FIELD: Record<string, string> = { declared_price_usd_cents: "price_usd" };

/** Formulario de solicitud de cotización (RF-12): una o varias prendas, cada una con su enlace. Exige sesión. */
export function ImportRequestForm() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user)!;
  const needsDocument = !user.document_id;
  const [rates, setRates] = useState<ImportRate[] | null>(null);
  const [ratesError, setRatesError] = useState(false);
  const [form, setForm] = useState<RequestForm>({ document_id: "", customer_notes: "", items: [{ ...EMPTY_ITEM }] });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let alive = true;
    getImportRates()
      .then((r) => alive && setRates(r))
      .catch(() => alive && setRatesError(true));
    return () => {
      alive = false;
    };
  }, []);

  const setItem = (i: number, k: keyof ItemForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, items: f.items.map((it, n) => (n === i ? { ...it, [k]: value } : it)) }));
  };
  const addItem = () => setForm((f) => (f.items.length >= MAX_ITEMS ? f : { ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  const removeItem = (i: number) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, n) => n !== i) }));
    setErrors({}); // los índices cambian: se revalida al enviar
  };

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (lock.current) return;
    const { errors: errs, data } = validateRequest(form, needsDocument);
    setErrors(errs);
    setFormError(null);
    if (!data) {
      focusFirstInvalid(formRef.current);
      return;
    }
    lock.current = true;
    setPending(true);
    try {
      const created = await createImport(data);
      router.replace(importPath(created.id, "?nuevo=1"));
    } catch (e) {
      const next: FieldErrors = {};
      let other: string | null = null;
      if (isApiError(e)) {
        for (const [k, msg] of Object.entries(e.fieldErrors)) {
          const m = /^items\[(\d+)\]\.(.+)$/.exec(k);
          if (m) next[`${m[1]}.${SERVER_FIELD[m[2]] ?? m[2]}`] = msg;
          else if (k === "document_id" || k === "customer_notes") next[k] = msg;
          else other ??= msg;
        }
        setFormError(Object.keys(next).length ? null : (other ?? (e.status === 429 ? "Hiciste muchas solicitudes seguidas. Espera un momento e inténtalo de nuevo." : e.message)));
      } else {
        setFormError("Algo salió mal. Inténtalo de nuevo.");
      }
      setErrors(next);
      focusFirstInvalid(formRef.current);
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-10">
      {formError && <Alert>{formError}</Alert>}
      {ratesError && <Alert>No pudimos cargar las categorías. Recarga la página e inténtalo de nuevo.</Alert>}

      {form.items.map((it, i) => (
        <section key={i} aria-labelledby={`item-${i}`} className="bg-surface-raised border-line space-y-5 border p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id={`item-${i}`} className="display-sm">
              Producto {form.items.length > 1 ? i + 1 : ""}
            </h2>
            {form.items.length > 1 && (
              <button type="button" onClick={() => removeItem(i)} className="body-sm text-ink-muted hover:text-ink inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:underline">
                <Trash2 className="size-4" strokeWidth={1.5} aria-hidden /> Quitar
              </button>
            )}
          </div>
          <Field label="Enlace del producto" name={`product_url_${i}`} required type="url" inputMode="url" autoComplete="off" value={it.product_url} onChange={setItem(i, "product_url")} error={errors[`${i}.product_url`]} hint="Copia la dirección de la página del producto en la tienda de EE. UU." />
          <Field label="¿Qué producto es?" name={`description_${i}`} required autoComplete="off" value={it.description} onChange={setItem(i, "description")} error={errors[`${i}.description`]} hint="Ej.: Jordan 1 Retro High OG «Chicago»." />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label="Categoría" name={`import_rate_id_${i}`} required value={it.import_rate_id} onChange={setItem(i, "import_rate_id")} error={errors[`${i}.import_rate_id`]} disabled={!rates}>
              <option value="">{rates ? "Elige una categoría" : "Cargando…"}</option>
              {rates?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectField>
            <Field label="Precio en la tienda (USD)" name={`price_usd_${i}`} required inputMode="decimal" autoComplete="off" value={it.price_usd} onChange={setItem(i, "price_usd")} error={errors[`${i}.price_usd`]} hint="Por unidad, sin impuestos. Ej.: 129.99" />
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Talla" name={`size_${i}`} autoComplete="off" value={it.size} onChange={setItem(i, "size")} error={errors[`${i}.size`]} hint="Ej.: US 9 o M" />
            <Field label="Color" name={`color_${i}`} autoComplete="off" value={it.color} onChange={setItem(i, "color")} error={errors[`${i}.color`]} />
            <Field label="Cantidad" name={`quantity_${i}`} required inputMode="numeric" autoComplete="off" value={it.quantity} onChange={setItem(i, "quantity")} error={errors[`${i}.quantity`]} />
          </div>
          <Field label="Tienda" name={`store_name_${i}`} autoComplete="off" value={it.store_name} onChange={setItem(i, "store_name")} error={errors[`${i}.store_name`]} hint="Ej.: Nike, StockX, GOAT." />
        </section>
      ))}

      {form.items.length < MAX_ITEMS && (
        <Button variant="secondary" onClick={addItem}>
          <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Agregar otro producto
        </Button>
      )}

      <section aria-labelledby="req-extra" className="space-y-5">
        <h2 id="req-extra" className="display-sm">
          Tus datos
        </h2>
        <p className="body-sm text-ink-muted">
          Tu solicitud queda a nombre de <strong className="text-ink font-semibold">{user.email}</strong>.
        </p>
        {needsDocument && (
          <Field label="Cédula o documento" name="document_id" required autoComplete="off" value={form.document_id} onChange={(e) => setForm((f) => ({ ...f, document_id: e.target.value }))} error={errors.document_id} hint="La aduana la exige: importamos a tu nombre. Sin puntos." />
        )}
        <TextAreaField label="Notas para el equipo" name="customer_notes" maxLength={2000} value={form.customer_notes} onChange={(e) => setForm((f) => ({ ...f, customer_notes: e.target.value }))} error={errors.customer_notes} hint="Ej.: acepto otro color si no hay stock." />
      </section>

      <div className="space-y-3">
        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          {pending ? "Enviando…" : "Solicitar cotización"}
        </Button>
        <p className="caption text-ink-muted">No pagas nada ahora. Te respondemos con una cotización formal, válida por 48 horas.</p>
      </div>
    </form>
  );
}

