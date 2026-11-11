"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { ConfirmButton } from "@/components/admin/catalog/ConfirmButton";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import { isApiError } from "@/lib/api-client";
import { formatCOP } from "@/lib/format";
import { parseCOP, parseCount } from "@/lib/product-status";
import { createVariant, deleteVariant, updateVariant } from "@/lib/catalog-admin";
import type { AdminProduct, AdminVariant, SizeSystem } from "@/types";

const SYSTEMS: { id: SizeSystem; label: string }[] = [
  { id: "EU", label: "EU (calzado 38–46)" },
  { id: "US", label: "US (calzado)" },
  { id: "ALPHA", label: "Ropa (XS–XXL)" },
  { id: "ONE", label: "Talla única" },
];

const errText = (e: unknown) => (isApiError(e) ? (Object.values(e.fieldErrors)[0] ?? e.message) : "Algo salió mal. Inténtalo de nuevo.");

/** Prefijo de SKU a partir del nombre: «Air Jordan 4» → AIR-JORDAN-4. */
const skuBase = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);

const skuPart = (size: string) => size.toUpperCase().replace(/[^A-Z0-9.]+/g, "");

interface Props {
  product: AdminProduct;
  onChange: (p: AdminProduct) => void;
}

/** Tallas y stock del producto. Cada fila se guarda sola; abajo se agregan tallas nuevas (una o varias de una vez). */
export function VariantsEditor({ product, onChange }: Props) {
  const variants = product.variants ?? [];
  return (
    <section aria-labelledby="ve-title" className="space-y-5">
      <div>
        <h2 id="ve-title" className="display-sm">
          Tallas y stock
        </h2>
        <p className="body-sm text-ink-muted mt-1">El stock que escribas aquí es lo que hay en bodega. Lo reservado por pedidos en curso no se puede quitar.</p>
      </div>

      {variants.length === 0 ? (
        <p className="body text-ink-muted border-line border border-dashed p-6 text-center">Aún no hay tallas. Agrégalas abajo para poder vender este producto.</p>
      ) : (
        <ul aria-label="Tallas del producto" className="space-y-3">
          {variants.map((v) => (
            <VariantRow key={v.id} productId={product.id} variant={v} onChange={onChange} />
          ))}
        </ul>
      )}

      <AddVariants product={product} onChange={onChange} />
    </section>
  );
}

function VariantRow({ productId, variant: v, onChange }: { productId: string; variant: AdminVariant; onChange: (p: AdminProduct) => void }) {
  const [stock, setStock] = useState(String(v.stock_on_hand));
  const [price, setPrice] = useState(v.price_override_cop ? String(v.price_override_cop) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  const dirty = stock !== String(v.stock_on_hand) || price !== (v.price_override_cop ? String(v.price_override_cop) : "");

  async function save() {
    const s = parseCount(stock);
    const p = parseCOP(price);
    if (s === null || s > 100000) return setError("El stock es un número entero, de 0 a 100000.");
    if (s < v.stock_reserved) return setError(`No puede ser menor que lo reservado en pedidos (${v.stock_reserved}).`);
    if (p === null) return setError("Escribe el precio en pesos o déjalo vacío.");
    setBusy(true);
    setError(null);
    try {
      onChange(await updateVariant(productId, v.id, { stock_on_hand: s, price_override_cop: p }));
      setOk(true);
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  }

  async function remove() {
    try {
      onChange(await deleteVariant(productId, v.id));
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <li className="bg-surface-raised border-line space-y-3 border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="body-strong">
          Talla {v.size} <span className="text-ink-muted font-mono text-xs font-normal">{v.sku}</span>
        </p>
        <p className="body-sm text-ink-muted tabular-nums">
          Reservado {v.stock_reserved} · Disponible {v.available}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="En bodega" name={`stock-${v.id}`} required inputMode="numeric" autoComplete="off" value={stock} onChange={(e) => { setStock(e.target.value); setOk(false); }} />
        <Field label="Precio propio (COP)" name={`price-${v.id}`} inputMode="numeric" autoComplete="off" value={price} onChange={(e) => { setPrice(e.target.value); setOk(false); }} hint={price && parseCOP(price) ? formatCOP(parseCOP(price)!) : `Vacío = ${formatCOP(v.price_cop)} (precio del producto)`} />
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={busy} disabled={!dirty} variant="secondary">
          Guardar talla
        </Button>
        {ok && !dirty && <span role="status" className="text-success body-sm">Guardado.</span>}
        <ConfirmButton label="Eliminar talla" ariaLabel={`Eliminar la talla ${v.size}`} onConfirm={remove} />
      </div>
    </li>
  );
}

function AddVariants({ product, onChange }: Props) {
  const [sizes, setSizes] = useState("");
  const [system, setSystem] = useState<SizeSystem>("EU");
  const [stock, setStock] = useState("0");
  const [prefix, setPrefix] = useState(() => skuBase(product.name));
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const list = [...new Set(sizes.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean))];
    const st = parseCount(stock);
    const fe: Record<string, string> = {};
    if (list.length === 0) fe.sizes = "Escribe al menos una talla. Para varias, sepáralas con comas: 40, 41, 42.";
    if (list.length > 30) fe.sizes = "Máximo 30 tallas a la vez.";
    if (list.some((s) => s.length > 20)) fe.sizes = "Cada talla tiene máximo 20 caracteres.";
    if (st === null || st > 100000) fe.stock = "Escribe un número entero, de 0 a 100000.";
    if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(prefix.toUpperCase()) || prefix.length < 1) fe.prefix = "Usa letras, números, punto o guion (ej. AJ4-WHT).";
    setFieldErr(fe);
    if (Object.keys(fe).length) return;

    setBusy(true);
    setErrors([]);
    const failed: string[] = [];
    let current = product;
    for (const size of list) {
      try {
        current = await createVariant(product.id, { sku: `${prefix.toUpperCase()}-${skuPart(size)}`, size, size_system: system, stock_on_hand: st! });
      } catch (e) {
        failed.push(`Talla ${size}: ${errText(e)}`);
      }
    }
    onChange(current);
    setErrors(failed);
    if (failed.length === 0) setSizes("");
    setBusy(false);
  }

  return (
    <form onSubmit={add} noValidate className="bg-surface border-line space-y-4 border border-dashed p-4">
      <h3 className="label">Agregar tallas</h3>
      <Field label="Tallas" name="sizes" required autoComplete="off" value={sizes} onChange={(e) => setSizes(e.target.value)} error={fieldErr.sizes} hint="Una o varias separadas por coma. Ej.: 40, 41, 42 · o · S, M, L" />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Sistema de tallas" name="system" required value={system} onChange={(e) => setSystem(e.target.value as SizeSystem)}>
          {SYSTEMS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </SelectField>
        <Field label="Unidades por talla" name="stock" required inputMode="numeric" autoComplete="off" value={stock} onChange={(e) => setStock(e.target.value)} error={fieldErr.stock} />
        <Field label="Prefijo del SKU" name="prefix" required autoComplete="off" value={prefix} onChange={(e) => setPrefix(e.target.value)} error={fieldErr.prefix} hint={`Ej.: ${prefix.toUpperCase() || "AJ4"}-42`} />
      </div>
      {errors.length > 0 && (
        <Alert>
          <ul className="space-y-1">
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}
      <Button type="submit" loading={busy}>
        <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Agregar
      </Button>
    </form>
  );
}
