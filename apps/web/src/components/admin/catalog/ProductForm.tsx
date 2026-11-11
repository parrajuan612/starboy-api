"use client";

import { useRef, useState } from "react";

import { Alert, Button, Field, SelectField, TextAreaField } from "@/components/ui";
import { isApiError } from "@/lib/api-client";
import { formatCOP } from "@/lib/format";
import { focusFirstInvalid, type FieldErrors } from "@/lib/forms";
import { GENDER_LABEL, ORIGIN_LABEL, parseCOP } from "@/lib/product-status";
import type { AdminBrand, AdminCategory, AdminProduct, Gender, ProductInput, ProductOrigin } from "@/types";

interface Form {
  name: string;
  brand_id: string;
  category_id: string;
  colorway: string;
  description: string;
  gender: Gender;
  origin: ProductOrigin;
  base_price: string;
  compare_at: string;
  cost: string;
  is_new_release: boolean;
  is_featured: boolean;
}

const fromProduct = (p?: AdminProduct): Form => ({
  name: p?.name ?? "",
  brand_id: p?.brand?.id ?? "",
  category_id: p?.category?.id ?? "",
  colorway: p?.colorway ?? "",
  description: p?.description ?? "",
  gender: p?.gender ?? "UNISEX",
  origin: p?.origin ?? "LOCAL",
  base_price: p ? String(p.base_price_cop) : "",
  compare_at: p && p.compare_at_price_cop ? String(p.compare_at_price_cop) : "",
  cost: p && p.cost_cop ? String(p.cost_cop) : "",
  is_new_release: p?.is_new_release ?? false,
  is_featured: p?.is_featured ?? false,
});

const FIELDS = ["name", "brand_id", "category_id", "colorway", "description", "gender", "origin", "base_price_cop", "compare_at_price_cop", "cost_cop"];
/** Campo de la API → campo del formulario. */
const MAP: Record<string, string> = { base_price_cop: "base_price", compare_at_price_cop: "compare_at", cost_cop: "cost" };

interface Props {
  product?: AdminProduct;
  brands: AdminBrand[];
  categories: AdminCategory[];
  onSubmit: (input: ProductInput) => Promise<void>;
  submitLabel: string;
}

/** Datos del producto (sin tallas ni fotos). Sirve para crear y para editar. */
export function ProductForm({ product, brands, categories, onSubmit, submitLabel }: Props) {
  const [f, setF] = useState<Form>(() => fromProduct(product));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setF((v) => ({ ...v, [k]: e.target.value }));
  };
  const flag = (k: "is_new_release" | "is_featured") => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setF((v) => ({ ...v, [k]: e.target.checked }));
  };

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (pending) return;
    const errs: FieldErrors = {};
    const base = parseCOP(f.base_price);
    const compare = parseCOP(f.compare_at);
    const cost = parseCOP(f.cost);
    if (f.name.trim().length < 2) errs.name = "Escribe el nombre del producto (mínimo 2 caracteres).";
    if (!f.brand_id) errs.brand_id = "Elige la marca.";
    if (!f.category_id) errs.category_id = "Elige la categoría.";
    if (base === null || base <= 0) errs.base_price = "Escribe el precio de venta en pesos, por ejemplo 399900.";
    if (compare === null) errs.compare_at = "Escribe un valor en pesos o déjalo vacío.";
    else if (base && compare > 0 && compare <= base) errs.compare_at = "Debe ser mayor que el precio de venta (es el precio tachado).";
    if (cost === null) errs.cost = "Escribe un valor en pesos o déjalo vacío.";
    if (f.description.length > 5000) errs.description = "Máximo 5000 caracteres.";
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) {
      focusFirstInvalid(ref.current);
      return;
    }
    setPending(true);
    try {
      await onSubmit({
        brand_id: f.brand_id, category_id: f.category_id, name: f.name.trim(), colorway: f.colorway.trim(), description: f.description.trim(),
        gender: f.gender, origin: f.origin, base_price_cop: base!, compare_at_price_cop: compare ?? 0, cost_cop: cost ?? 0,
        is_new_release: f.is_new_release, is_featured: f.is_featured,
      });
      setSaved(true);
    } catch (e) {
      const next: FieldErrors = {};
      let other: string | null = null;
      if (isApiError(e)) {
        for (const [k, msg] of Object.entries(e.fieldErrors)) {
          if (FIELDS.includes(k)) next[MAP[k] ?? k] = msg;
          else other ??= msg;
        }
        setFormError(Object.keys(next).length ? null : (other ?? e.message));
      } else setFormError("Algo salió mal. Inténtalo de nuevo.");
      setErrors(next);
      focusFirstInvalid(ref.current);
    }
    setPending(false);
  }

  const roots = categories.filter((c) => c.parent_id === null);
  const children = (id: string) => categories.filter((c) => c.parent_id === id);
  const money = (raw: string) => {
    const n = parseCOP(raw);
    return n ? formatCOP(n) : undefined;
  };

  return (
    <form ref={ref} onSubmit={submit} noValidate className="space-y-5">
      {formError && <Alert>{formError}</Alert>}
      <Field label="Nombre" name="name" required autoComplete="off" value={f.name} onChange={set("name")} error={errors.name} hint="Como lo verá el cliente. Ej.: Air Jordan 4 Retro" />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField label="Marca" name="brand_id" required value={f.brand_id} onChange={set("brand_id")} error={errors.brand_id} hint={brands.length === 0 ? "Crea una marca primero en Catálogo." : undefined}>
          <option value="">Elige la marca</option>
          {brands.filter((b) => b.is_active || b.id === f.brand_id).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </SelectField>
        <SelectField label="Categoría" name="category_id" required value={f.category_id} onChange={set("category_id")} error={errors.category_id} hint={categories.length === 0 ? "Crea una categoría primero en Catálogo." : undefined}>
          <option value="">Elige la categoría</option>
          {roots.map((r) =>
            children(r.id).length ? (
              <optgroup key={r.id} label={r.name}>
                <option value={r.id}>{r.name} (general)</option>
                {children(r.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ) : (
              <option key={r.id} value={r.id}>{r.name}</option>
            ),
          )}
        </SelectField>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Color o versión" name="colorway" autoComplete="off" value={f.colorway} onChange={set("colorway")} error={errors.colorway} hint="Ej.: White Oreo, Negro" />
        <SelectField label="Para" name="gender" required value={f.gender} onChange={set("gender")} error={errors.gender}>
          {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
            <option key={g} value={g}>{GENDER_LABEL[g]}</option>
          ))}
        </SelectField>
      </div>
      <SelectField label="Origen" name="origin" required value={f.origin} onChange={set("origin")} error={errors.origin} hint="«Importado» aparece en Encargos USA → Stock disponible.">
        {(Object.keys(ORIGIN_LABEL) as ProductOrigin[]).map((o) => (
          <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>
        ))}
      </SelectField>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Precio de venta (COP)" name="base_price" required inputMode="numeric" autoComplete="off" value={f.base_price} onChange={set("base_price")} error={errors.base_price} hint={money(f.base_price) ?? "Ej.: 399900"} />
        <Field label="Precio antes (tachado)" name="compare_at" inputMode="numeric" autoComplete="off" value={f.compare_at} onChange={set("compare_at")} error={errors.compare_at} hint={money(f.compare_at) ?? "Solo si hay descuento"} />
        <Field label="Costo (interno)" name="cost" inputMode="numeric" autoComplete="off" value={f.cost} onChange={set("cost")} error={errors.cost} hint={money(f.cost) ?? "Nunca se muestra al cliente"} />
      </div>
      <TextAreaField label="Descripción" name="description" maxLength={5000} value={f.description} onChange={set("description")} error={errors.description} hint="Materiales, ajuste, detalles. Aparece en la página del producto." />
      <fieldset className="space-y-1">
        <legend className="sb-label">Destacados</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={f.is_new_release} onChange={flag("is_new_release")} className="size-5" />
          <span className="body">Nuevo lanzamiento</span>
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={f.is_featured} onChange={flag("is_featured")} className="size-5" />
          <span className="body">Destacado en el inicio</span>
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={pending}>{submitLabel}</Button>
        {saved && <p role="status" className="text-success body-sm">Cambios guardados.</p>}
      </div>
    </form>
  );
}
