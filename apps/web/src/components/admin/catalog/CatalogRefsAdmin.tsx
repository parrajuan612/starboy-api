"use client";

import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

import { ConfirmButton } from "@/components/admin/catalog/ConfirmButton";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import { isApiError } from "@/lib/api-client";
import {
  createBrand, createCategory, deleteBrand, deleteCategory, listBrands, listCategories, updateBrand, updateCategory,
} from "@/lib/catalog-admin";
import { parseCount } from "@/lib/product-status";
import type { AdminBrand, AdminCategory } from "@/types";

type Tab = "brands" | "categories";

const errText = (e: unknown) => (isApiError(e) ? (Object.values(e.fieldErrors)[0] ?? e.message) : "Algo salió mal. Inténtalo de nuevo.");

/** Marcas y categorías: lo que el cliente usa para navegar y lo que el producto elige al crearse. */
export function CatalogRefsAdmin() {
  const [tab, setTab] = useState<Tab>("brands");
  const base = useId();
  const tabs: { id: Tab; label: string }[] = [
    { id: "brands", label: "Marcas" },
    { id: "categories", label: "Categorías" },
  ];
  return (
    <section aria-labelledby="cat-title">
      <h1 id="cat-title" className="display-md">
        Catálogo
      </h1>
      <p className="body text-ink-muted mt-2">Las marcas y categorías disponibles al crear un producto. Si desactivas una, deja de elegirse en productos nuevos.</p>
      <div role="tablist" aria-label="Catálogo" className="border-line mt-6 flex overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t.id} role="tab" id={`${base}-${t.id}`} aria-selected={tab === t.id} aria-controls={`${base}-panel`} type="button" onClick={() => setTab(t.id)}
            className={`label min-h-11 border-b-2 px-4 whitespace-nowrap ${tab === t.id ? "border-brand text-ink" : "text-ink-muted hover:text-ink border-transparent"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-${tab}`} className="mt-6">
        {tab === "brands" ? <Brands /> : <Categories />}
      </div>
    </section>
  );
}

function useList<T>(load: () => Promise<T[]>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    load().then((r) => { setRows(r); setError(null); }).catch((e) => setError(errText(e)));
  }, [load]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { rows, error, reload };
}

const Loading = () => (
  <p role="status" className="body text-ink-muted flex items-center gap-2">
    <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando…
  </p>
);

// ───────────────────────── Marcas
function Brands() {
  const { rows, error, reload } = useList<AdminBrand>(listBrands);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    if (name.trim().length < 1) return setErr("Escribe el nombre de la marca.");
    setBusy(true);
    setErr(null);
    try {
      await createBrand({ name: name.trim() });
      setName("");
      reload();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={add} noValidate className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:flex-1">
          <Field label="Nueva marca" name="brand-name" required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} error={err ?? undefined} />
        </div>
        <Button type="submit" loading={busy}>
          <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Agregar
        </Button>
      </form>
      {error && <Alert>{error}</Alert>}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <p className="body text-ink-muted border-line border border-dashed p-6 text-center">Aún no hay marcas.</p>}
      {rows && rows.length > 0 && (
        <ul aria-label="Marcas" className="divide-line bg-surface-raised border-line divide-y border">
          {rows.map((b) => (
            <BrandRow key={b.id} brand={b} onChange={reload} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BrandRow({ brand, onChange }: { brand: AdminBrand; onChange: () => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(brand.name);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setEdit(false);
      onChange();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  return (
    <li className="space-y-2 p-4">
      {edit ? (
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) void run(() => updateBrand(brand.id, { name: name.trim() })); }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:flex-1">
            <Field label="Nombre" name={`bn-${brand.id}`} required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>Guardar</Button>
            <Button variant="secondary" onClick={() => { setEdit(false); setName(brand.name); setErr(null); }}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="body-strong">
            {brand.name} {!brand.is_active && <span className="sb-badge sb-badge--neutral ml-2">Inactiva</span>}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => setEdit(true)} className="body-sm inline-flex min-h-11 items-center px-2 underline underline-offset-4">Editar</button>
            <button type="button" disabled={busy} onClick={() => run(() => updateBrand(brand.id, { is_active: !brand.is_active }))} className="body-sm inline-flex min-h-11 items-center px-2 underline underline-offset-4">
              {brand.is_active ? "Desactivar" : "Activar"}
            </button>
            <ConfirmButton label="Eliminar" ariaLabel={`Eliminar la marca ${brand.name}`} onConfirm={() => run(() => deleteBrand(brand.id))} />
          </div>
        </div>
      )}
      {err && <Alert>{err}</Alert>}
    </li>
  );
}

// ───────────────────────── Categorías
function Categories() {
  const { rows, error, reload } = useList<AdminCategory>(listCategories);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    if (name.trim().length < 2) return setErr("Escribe el nombre de la categoría (mínimo 2 caracteres).");
    setBusy(true);
    setErr(null);
    try {
      await createCategory({ name: name.trim(), ...(parent ? { parent_id: parent } : {}) });
      setName("");
      reload();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  const roots = (rows ?? []).filter((c) => c.parent_id === null);
  const kids = (id: string) => (rows ?? []).filter((c) => c.parent_id === id);

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={add} noValidate className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Nueva categoría" name="cat-name" required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} error={err ?? undefined} />
        <SelectField label="Dentro de" name="cat-parent" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Ninguna (categoría principal)</option>
          {roots.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </SelectField>
        <Button type="submit" loading={busy}>
          <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Agregar
        </Button>
      </form>
      {error && <Alert>{error}</Alert>}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <p className="body text-ink-muted border-line border border-dashed p-6 text-center">Aún no hay categorías.</p>}
      {rows && rows.length > 0 && (
        <ul aria-label="Categorías" className="divide-line bg-surface-raised border-line divide-y border">
          {roots.map((r) => (
            <li key={r.id}>
              <CategoryRow cat={r} onChange={reload} />
              {kids(r.id).length > 0 && (
                <ul aria-label={`Subcategorías de ${r.name}`} className="divide-line border-line divide-y border-t pl-4 md:pl-8">
                  {kids(r.id).map((c) => (
                    <li key={c.id}>
                      <CategoryRow cat={c} onChange={reload} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryRow({ cat, onChange }: { cat: AdminCategory; onChange: () => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(cat.name);
  const [order, setOrder] = useState(String(cat.sort_order));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setEdit(false);
      onChange();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const n = parseCount(order);
    if (name.trim().length < 2) return setErr("Escribe el nombre (mínimo 2 caracteres).");
    if (n === null || n > 10000) return setErr("El orden es un número entero, de 0 a 10000.");
    void run(() => updateCategory(cat.id, { name: name.trim(), sort_order: n }));
  }

  return (
    <div className="space-y-2 p-4">
      {edit ? (
        <form onSubmit={save} noValidate className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <Field label="Nombre" name={`cn-${cat.id}`} required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Orden" name={`co-${cat.id}`} inputMode="numeric" autoComplete="off" value={order} onChange={(e) => setOrder(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>Guardar</Button>
            <Button variant="secondary" onClick={() => { setEdit(false); setName(cat.name); setOrder(String(cat.sort_order)); setErr(null); }}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="body-strong">
            {cat.name} {!cat.is_active && <span className="sb-badge sb-badge--neutral ml-2">Inactiva</span>}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => setEdit(true)} className="body-sm inline-flex min-h-11 items-center px-2 underline underline-offset-4">Editar</button>
            <button type="button" disabled={busy} onClick={() => run(() => updateCategory(cat.id, { is_active: !cat.is_active }))} className="body-sm inline-flex min-h-11 items-center px-2 underline underline-offset-4">
              {cat.is_active ? "Desactivar" : "Activar"}
            </button>
            <ConfirmButton label="Eliminar" ariaLabel={`Eliminar la categoría ${cat.name}`} onConfirm={() => run(() => deleteCategory(cat.id))} />
          </div>
        </div>
      )}
      {err && <Alert>{err}</Alert>}
    </div>
  );
}
