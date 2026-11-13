"use client";

import { ArrowDown, ArrowUp, ExternalLink, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ConfirmButton } from "@/components/admin/catalog/ConfirmButton";
import { Alert, Button, Field, SelectField } from "@/components/ui";
import { isApiError } from "@/lib/api-client";
import { focusFirstInvalid, type FieldErrors } from "@/lib/forms";
import { getHomeContent, saveHomeContent } from "@/lib/home";
import type { HomeContent, HomeSection, HomeTile, SectionKind } from "@/types";

import { ImageField } from "./ImageField";
import { ProductPicker } from "./ProductPicker";

const KINDS: { value: SectionKind; label: string; help: string }[] = [
  { value: "NEW_RELEASES", label: "Nuevos lanzamientos", help: "Se llena sola con los productos marcados «Nuevo lanzamiento»." },
  { value: "FEATURED", label: "Destacados", help: "Se llena sola con los productos marcados «Destacado»." },
  { value: "ON_SALE", label: "En promoción", help: "Se llena sola con los productos que tienen precio de lista mayor al de venta." },
  { value: "PICKED", label: "Selección manual", help: "Tú eliges los productos y su orden." },
];
const KIND_TITLE: Record<SectionKind, string> = { NEW_RELEASES: "Nuevos lanzamientos", FEATURED: "Destacados", ON_SALE: "En promoción", PICKED: "Selección" };

const emptyTile = (): HomeTile => ({ image_url: "", title: "", subtitle: "", label: "", url: "" });
const emptySection = (): HomeSection => ({ kind: "FEATURED", enabled: true, title: "Destacados", subtitle: "", limit: 8, product_slugs: [], view_all_url: "" });

function Card({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="border-line bg-surface-raised border p-5 md:p-6">
      <h2 id={id} className="display-sm">
        {title}
      </h2>
      {description && <p className="body-sm text-ink-muted mt-1 max-w-2xl">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input type="checkbox" className="size-5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="body">{label}</span>
    </label>
  );
}

/** Mover un elemento de una lista (arriba/abajo) y quitarlo. */
function ItemBar({ i, n, label, onMove, onRemove }: { i: number; n: number; label: string; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" aria-label={`Subir ${label}`} disabled={i === 0} onClick={() => onMove(-1)} className="inline-flex size-11 items-center justify-center disabled:opacity-30">
        <ArrowUp className="size-4" strokeWidth={1.5} aria-hidden />
      </button>
      <button type="button" aria-label={`Bajar ${label}`} disabled={i === n - 1} onClick={() => onMove(1)} className="inline-flex size-11 items-center justify-center disabled:opacity-30">
        <ArrowDown className="size-4" strokeWidth={1.5} aria-hidden />
      </button>
      <ConfirmButton label="Quitar" ariaLabel={`Quitar ${label}`} confirmLabel="Sí, quitar" onConfirm={onRemove} />
    </div>
  );
}

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const next = [...list];
  [next[i], next[i + d]] = [next[i + d], next[i]];
  return next;
}

/** Editor de la portada: aviso, banner principal, banners, filas de productos y categorías con foto. */
export function HomeAdmin() {
  const [c, setC] = useState<HomeContent | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let alive = true;
    getHomeContent()
      .then((d) => alive && setC(d))
      .catch((e) => alive && setLoadError(isApiError(e) ? e.message : "No pudimos cargar la portada."));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!c)
    return (
      <p role="status" className="body text-ink-muted flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando…
      </p>
    );

  const edit = (fn: (d: HomeContent) => void) => {
    const d = structuredClone(c);
    fn(d);
    setC(d);
    setDirty(true);
    setSaved(false);
  };
  const err = (k: string) => errors[k];

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy || !c) return;
    setBusy(true);
    setFormError(null);
    setErrors({});
    try {
      setC(await saveHomeContent(c));
      setDirty(false);
      setSaved(true);
    } catch (e) {
      if (isApiError(e)) {
        setErrors(e.fieldErrors);
        setFormError(Object.keys(e.fieldErrors).length ? "Revisa los campos marcados." : e.message);
        focusFirstInvalid(ref.current);
      } else setFormError("Algo salió mal. Inténtalo de nuevo.");
    }
    setBusy(false);
  }

  const tileEditor = (prefix: "banners" | "categories.items", list: HomeTile[], opts: { subtitle: boolean; button: boolean; ratio: string; noun: string }) =>
    list.map((t, i) => {
      const set = (patch: Partial<HomeTile>) => edit((d) => Object.assign((prefix === "banners" ? d.banners : d.categories.items)[i], patch));
      const label = `${opts.noun} ${i + 1}`;
      return (
        <div key={i} className="border-line space-y-4 border p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="label">{label}</p>
            <ItemBar
              i={i}
              n={list.length}
              label={label}
              onMove={(dir) => edit((d) => { if (prefix === "banners") d.banners = move(d.banners, i, dir); else d.categories.items = move(d.categories.items, i, dir); })}
              onRemove={() => edit((d) => { if (prefix === "banners") d.banners.splice(i, 1); else d.categories.items.splice(i, 1); })}
            />
          </div>
          <ImageField label="Foto" value={t.image_url} onChange={(u) => set({ image_url: u })} error={err(`${prefix}.${i}.image_url`)} ratio={opts.ratio} hint="Vertical u horizontal: se recorta para llenar la tarjeta." />
          <Field label={opts.subtitle ? "Título" : "Nombre"} name={`${prefix}.${i}.title`} required={!opts.subtitle} value={t.title} onChange={(e) => set({ title: e.target.value })} error={err(`${prefix}.${i}.title`)} maxLength={60} />
          {opts.subtitle && <Field label="Texto corto" name={`${prefix}.${i}.subtitle`} value={t.subtitle} onChange={(e) => set({ subtitle: e.target.value })} error={err(`${prefix}.${i}.subtitle`)} maxLength={120} />}
          <div className={opts.button ? "grid gap-4 md:grid-cols-2" : ""}>
            <Field label="Enlace" name={`${prefix}.${i}.url`} value={t.url} onChange={(e) => set({ url: e.target.value })} error={err(`${prefix}.${i}.url`)} placeholder="/nuevos o https://…" hint="Ruta de la tienda (/hombre/zapatos) o dirección https://." />
            {opts.button && <Field label="Texto del botón" name={`${prefix}.${i}.label`} value={t.label} onChange={(e) => set({ label: e.target.value })} error={err(`${prefix}.${i}.label`)} maxLength={30} placeholder="Comprar" />}
          </div>
        </div>
      );
    });

  const h = c.hero;
  return (
    <form ref={ref} onSubmit={submit} noValidate className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display-md">Inicio</h1>
          <p className="body text-ink-muted mt-2 max-w-2xl">Lo que ven los clientes al entrar a la tienda. Los cambios se ven en la tienda en 1 minuto (el aviso superior, hasta en 5).</p>
        </div>
        <Link href="/" target="_blank" className="label inline-flex min-h-11 items-center gap-2 underline underline-offset-4">
          Ver la tienda <ExternalLink className="size-4" strokeWidth={1.5} aria-hidden />
        </Link>
      </div>
      {formError && <Alert>{formError}</Alert>}

      <Card id="h-ann" title="Aviso superior" description="Una franja de color sobre el encabezado: ofertas, envíos, fechas especiales.">
        <Toggle label="Mostrar el aviso" checked={c.announcement.enabled} onChange={(v) => edit((d) => { d.announcement.enabled = v; })} />
        <Field label="Texto" name="announcement.text" value={c.announcement.text} onChange={(e) => edit((d) => { d.announcement.text = e.target.value; })} error={err("announcement.text")} maxLength={140} required={c.announcement.enabled} />
        <Field label="Enlace" name="announcement.url" value={c.announcement.url} onChange={(e) => edit((d) => { d.announcement.url = e.target.value; })} error={err("announcement.url")} placeholder="/promociones" />
      </Card>

      <Card id="h-hero" title="Banner principal" description="La primera imagen grande de la portada. Con foto, el texto se pone encima; sin foto, usa el fondo de la marca.">
        <Toggle label="Mostrar el banner principal" checked={h.enabled} onChange={(v) => edit((d) => { d.hero.enabled = v; })} />
        <ImageField label="Foto de fondo" value={h.image_url} onChange={(u) => edit((d) => { d.hero.image_url = u; })} error={err("hero.image_url")} ratio="aspect-[21/9]" hint="Mejor horizontal y de buena calidad (mínimo 1600 px de ancho). JPG, PNG o WebP, hasta 5 MB." />
        <Field label="Texto pequeño superior" name="hero.eyebrow" value={h.eyebrow} onChange={(e) => edit((d) => { d.hero.eyebrow = e.target.value; })} error={err("hero.eyebrow")} maxLength={40} placeholder="Nueva temporada" />
        <Field label="Título" name="hero.title" required value={h.title} onChange={(e) => edit((d) => { d.hero.title = e.target.value; })} error={err("hero.title")} maxLength={80} />
        <Field label="Descripción" name="hero.subtitle" value={h.subtitle} onChange={(e) => edit((d) => { d.hero.subtitle = e.target.value; })} error={err("hero.subtitle")} maxLength={220} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Botón principal: texto" name="hero.primary_label" value={h.primary_label} onChange={(e) => edit((d) => { d.hero.primary_label = e.target.value; })} error={err("hero.primary_label")} maxLength={30} />
          <Field label="Botón principal: enlace" name="hero.primary_url" value={h.primary_url} onChange={(e) => edit((d) => { d.hero.primary_url = e.target.value; })} error={err("hero.primary_url")} placeholder="/nuevos" />
          <Field label="Botón secundario: texto" name="hero.secondary_label" value={h.secondary_label} onChange={(e) => edit((d) => { d.hero.secondary_label = e.target.value; })} error={err("hero.secondary_label")} maxLength={30} />
          <Field label="Botón secundario: enlace" name="hero.secondary_url" value={h.secondary_url} onChange={(e) => edit((d) => { d.hero.secondary_url = e.target.value; })} error={err("hero.secondary_url")} placeholder="/encargos-usa" />
        </div>
      </Card>

      <Card id="h-ban" title="Banners promocionales" description="De 1 a 3 imágenes con enlace, justo debajo del banner principal (campañas, colecciones, marcas).">
        {err("banners") && <p role="alert" className="sb-field-error">{err("banners")}</p>}
        {tileEditor("banners", c.banners, { subtitle: true, button: true, ratio: "aspect-[16/9]", noun: "Banner" })}
        <Button variant="secondary" disabled={c.banners.length >= 3} onClick={() => edit((d) => { d.banners.push(emptyTile()); })}>
          <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Agregar banner {c.banners.length >= 3 && "(máximo 3)"}
        </Button>
      </Card>

      <Card id="h-sec" title="Filas de productos" description="Cada fila muestra productos de la tienda. Las automáticas se llenan solas con las casillas que marcas en cada producto; si una fila queda sin productos, no se muestra.">
        {err("sections") && <p role="alert" className="sb-field-error">{err("sections")}</p>}
        {c.sections.map((s, i) => {
          const set = (patch: Partial<HomeSection>) => edit((d) => Object.assign(d.sections[i], patch));
          const label = `fila ${i + 1}`;
          const kind = KINDS.find((k) => k.value === s.kind);
          return (
            <div key={i} className="border-line space-y-4 border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="label">Fila {i + 1}</p>
                <ItemBar i={i} n={c.sections.length} label={label} onMove={(d) => edit((x) => { x.sections = move(x.sections, i, d); })} onRemove={() => edit((x) => { x.sections.splice(i, 1); })} />
              </div>
              <Toggle label="Mostrar esta fila" checked={s.enabled} onChange={(v) => set({ enabled: v })} />
              <SelectField
                label="Qué productos muestra"
                name={`sections.${i}.kind`}
                required
                value={s.kind}
                hint={kind?.help}
                error={err(`sections.${i}.kind`)}
                onChange={(e) => {
                  const next = e.target.value as SectionKind;
                  const wasDefault = Object.values(KIND_TITLE).includes(s.title);
                  set({ kind: next, ...(wasDefault ? { title: KIND_TITLE[next] } : {}), ...(next === "PICKED" ? {} : { product_slugs: [] }) });
                }}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </SelectField>
              <Field label="Título de la fila" name={`sections.${i}.title`} required value={s.title} onChange={(e) => set({ title: e.target.value })} error={err(`sections.${i}.title`)} maxLength={60} />
              <Field label="Texto bajo el título" name={`sections.${i}.subtitle`} value={s.subtitle} onChange={(e) => set({ subtitle: e.target.value })} error={err(`sections.${i}.subtitle`)} maxLength={120} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Cuántos productos" name={`sections.${i}.limit`} type="number" inputMode="numeric" min={2} max={12} required value={String(s.limit)} onChange={(e) => set({ limit: Number(e.target.value) })} error={err(`sections.${i}.limit`)} hint="Entre 2 y 12." />
                <Field label="Enlace de «Ver todo»" name={`sections.${i}.view_all_url`} value={s.view_all_url} onChange={(e) => set({ view_all_url: e.target.value })} error={err(`sections.${i}.view_all_url`)} placeholder="/nuevos" hint="Opcional." />
              </div>
              {s.kind === "PICKED" && <ProductPicker slugs={s.product_slugs} max={12} onChange={(slugs) => set({ product_slugs: slugs })} error={err(`sections.${i}.product_slugs`)} />}
            </div>
          );
        })}
        <Button variant="secondary" disabled={c.sections.length >= 6} onClick={() => edit((d) => { d.sections.push(emptySection()); })}>
          <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Agregar fila {c.sections.length >= 6 && "(máximo 6)"}
        </Button>
      </Card>

      <Card id="h-cat" title="Categorías con foto" description="Atajos visuales al final de la portada (por ejemplo Zapatos, Camisetas, Accesorios).">
        <Toggle label="Mostrar este bloque" checked={c.categories.enabled} onChange={(v) => edit((d) => { d.categories.enabled = v; })} />
        <Field label="Título del bloque" name="categories.title" value={c.categories.title} onChange={(e) => edit((d) => { d.categories.title = e.target.value; })} error={err("categories.title")} maxLength={60} />
        {err("categories.items") && <p role="alert" className="sb-field-error">{err("categories.items")}</p>}
        {tileEditor("categories.items", c.categories.items, { subtitle: false, button: false, ratio: "aspect-[4/3]", noun: "Categoría" })}
        <Button variant="secondary" disabled={c.categories.items.length >= 6} onClick={() => edit((d) => { d.categories.items.push(emptyTile()); })}>
          <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Agregar categoría {c.categories.items.length >= 6 && "(máximo 6)"}
        </Button>
      </Card>

      <div className="bg-surface border-line sticky bottom-0 -mx-4 flex flex-wrap items-center gap-4 border-t px-4 py-3 md:mx-0 md:px-0">
        <Button type="submit" loading={busy} disabled={!dirty}>
          Guardar cambios
        </Button>
        {dirty && <span className="body-sm text-ink-muted">Hay cambios sin guardar</span>}
        {saved && !dirty && (
          <p role="status" className="text-success body-sm">
            Guardado. Ya se ve en la tienda (hasta 1 minuto).
          </p>
        )}
      </div>
    </form>
  );
}
