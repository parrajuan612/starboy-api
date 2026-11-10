"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export interface CatNode {
  label: string;
  href: string;
  current: boolean;
  /** Rama abierta (la categoría actual o uno de sus ancestros). */
  open: boolean;
  children: CatNode[];
}

interface Props {
  /** Evita IDs repetidos: el panel se dibuja dos veces (columna de escritorio y drawer móvil). */
  idPrefix: string;
  basePath: string;
  categories: CatNode[] | null;
  allHref: string;
  allCurrent: boolean;
  brands: { name: string; slug: string }[] | null;
  values: { marca?: string; min?: number; max?: number };
  hidden: { q?: string; orden?: string };
  clearHref: string;
  onDone?: () => void;
}

/**
 * Filtros (§12.8): Categoría (navegación), Marca (select), Precio (desde/hasta en COP) y botón FILTRAR.
 * Es un formulario GET normal; con JS arma una URL limpia sin parámetros vacíos.
 */
export function FilterPanel({ idPrefix, basePath, categories, allHref, allCurrent, brands, values, hidden, clearHref, onDone }: Props) {
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      const val = String(v).trim();
      if (val) p.set(k, val);
    }
    const qs = p.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
    onDone?.();
  }

  return (
    <div className="space-y-8">
      {categories && (
        <nav aria-label="Categorías">
          <h2 className="label mb-3">Categoría</h2>
          <ul className="space-y-1">
            <li>
              <Link href={allHref} aria-current={allCurrent ? "page" : undefined} className={`body-sm flex min-h-9 items-center ${allCurrent ? "text-ink font-semibold" : "text-ink-muted hover:text-ink"}`}>
                Todo
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.href}>
                <Link href={c.href} aria-current={c.current ? "page" : undefined} className={`body-sm flex min-h-9 items-center ${c.current || c.open ? "text-ink font-semibold" : "text-ink-muted hover:text-ink"}`}>
                  {c.label}
                </Link>
                {c.open && c.children.length > 0 && (
                  <ul className="border-line mb-1 ml-2 border-l pl-3">
                    {c.children.map((s) => (
                      <li key={s.href}>
                        <Link href={s.href} aria-current={s.current ? "page" : undefined} className={`body-sm flex min-h-9 items-center ${s.current ? "text-ink font-semibold" : "text-ink-muted hover:text-ink"}`}>
                          {s.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}

      <form action={basePath} method="get" onSubmit={onSubmit} className="space-y-6">
        {hidden.q && <input type="hidden" name="q" value={hidden.q} />}
        {hidden.orden && <input type="hidden" name="orden" value={hidden.orden} />}

        {brands && brands.length > 0 && (
          <div>
            <label htmlFor={`${idPrefix}-marca`} className="label mb-2 block">
              Marca
            </label>
            <select id={`${idPrefix}-marca`} name="marca" defaultValue={values.marca ?? ""} className="sb-input">
              <option value="">Todas</option>
              {brands.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <fieldset>
          <legend className="label mb-2">Precio (COP)</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${idPrefix}-min`} className="caption text-ink-muted mb-1 block">
                Desde
              </label>
              <input id={`${idPrefix}-min`} name="min" type="number" inputMode="numeric" min={0} step={10000} defaultValue={values.min} placeholder="0" className="sb-input" />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-max`} className="caption text-ink-muted mb-1 block">
                Hasta
              </label>
              <input id={`${idPrefix}-max`} name="max" type="number" inputMode="numeric" min={0} step={10000} defaultValue={values.max} placeholder="Sin tope" className="sb-input" />
            </div>
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <button type="submit" className="sb-btn sb-btn--primary w-full">
            Filtrar
          </button>
          <Link href={clearHref} onClick={onDone} className="sb-btn sb-btn--secondary w-full">
            Limpiar filtros
          </Link>
        </div>
      </form>
    </div>
  );
}
