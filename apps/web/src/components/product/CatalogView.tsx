import Link from "next/link";

import { buildHref, SORTS, toApiQuery, type Filters, type Scope } from "@/lib/catalog-query";
import { getProducts } from "@/lib/catalog-server";
import { formatCOP } from "@/lib/format";
import type { Brand } from "@/types";

import { Breadcrumbs, type Crumb } from "./Breadcrumbs";
import { FilterPanel, type CatNode } from "./FilterPanel";
import { FiltersDrawer } from "./FiltersDrawer";
import { Pagination } from "./Pagination";
import { ProductGrid } from "./ProductGrid";
import { SortSelect } from "./SortSelect";

export interface CatalogViewProps {
  title: string;
  intro?: string;
  /** Ruta de esta pantalla, sin parámetros (ej. /hombre/zapatos). Los filtros y la paginación se arman sobre ella. */
  path: string;
  crumbs: Crumb[];
  scope: Scope;
  filters: Filters;
  brands: Brand[];
  /** Árbol de categorías para la columna de filtros; null si esta pantalla no filtra por categoría. */
  categoryNav: { nodes: CatNode[]; allHref: string; allCurrent: boolean } | null;
  /** Ruta para «Limpiar filtros» (la misma pantalla sin marca ni precio). */
  showBrandFilter?: boolean;
}

export async function CatalogView({ title, intro, path, crumbs, scope, filters, brands, categoryNav, showBrandFilter = true }: CatalogViewProps) {
  const page = await getProducts(toApiQuery(scope, filters));
  const sortOptions = SORTS.map((s) => ({ value: s.value, label: s.label, href: buildHref(path, filters, { orden: s.value === "recientes" ? undefined : s.value }) }));

  const hasPrice = filters.min !== undefined || filters.max !== undefined;
  const activeCount = (filters.marca && showBrandFilter ? 1 : 0) + (hasPrice ? 1 : 0);
  const clearHref = buildHref(path, { ...filters, marca: undefined, min: undefined, max: undefined }, {});

  const panel = {
    basePath: path,
    categories: categoryNav?.nodes ?? null,
    allHref: categoryNav?.allHref ?? path,
    allCurrent: categoryNav?.allCurrent ?? false,
    brands: showBrandFilter ? brands : null,
    values: { marca: filters.marca, min: filters.min, max: filters.max },
    hidden: { q: filters.q, orden: filters.orden === "recientes" ? undefined : filters.orden },
    clearHref,
  };

  const chips: { label: string; href: string }[] = [];
  if (filters.marca && showBrandFilter) {
    chips.push({ label: `Marca: ${brands.find((b) => b.slug === filters.marca)?.name ?? filters.marca}`, href: buildHref(path, filters, { marca: undefined }) });
  }
  if (hasPrice) {
    const label = filters.min !== undefined && filters.max !== undefined ? `${formatCOP(filters.min)} – ${formatCOP(filters.max)}` : filters.min !== undefined ? `Desde ${formatCOP(filters.min)}` : `Hasta ${formatCOP(filters.max!)}`;
    chips.push({ label: `Precio: ${label}`, href: buildHref(path, filters, { min: undefined, max: undefined }) });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <Breadcrumbs items={crumbs} />
      <header className="mt-4 mb-6 md:mb-8">
        <h1 className="display-lg">{title}</h1>
        {intro && <p className="body text-ink-muted mt-2 max-w-2xl">{intro}</p>}
      </header>

      <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <FilterPanel {...panel} idPrefix="d" />
          </div>
        </aside>

        <section aria-label="Resultados">
          <div className="border-line mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div className="flex items-center gap-3">
              <FiltersDrawer {...panel} activeCount={activeCount} />
              {page && (
                <p className="body-sm text-ink-muted" aria-live="polite">
                  {page.meta.total} {page.meta.total === 1 ? "producto" : "productos"}
                </p>
              )}
            </div>
            <SortSelect value={filters.orden} options={sortOptions} />
          </div>

          {chips.length > 0 && (
            <ul className="mb-4 flex flex-wrap gap-2" aria-label="Filtros aplicados">
              {chips.map((c) => (
                <li key={c.label}>
                  <Link href={c.href} className="sb-badge sb-badge--neutral min-h-8 gap-2 px-3" aria-label={`Quitar filtro: ${c.label}`}>
                    {c.label}
                    <span aria-hidden>×</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {page === null ? (
            <div role="alert" className="border-line bg-surface-raised border p-8 text-center">
              <h2 className="display-sm">No pudimos cargar los productos</h2>
              <p className="body text-ink-muted mt-2">Tuvimos un problema de conexión. Inténtalo de nuevo en unos segundos.</p>
              <Link href={buildHref(path, filters, { pagina: filters.pagina })} className="sb-btn sb-btn--primary mt-6">
                Reintentar
              </Link>
            </div>
          ) : page.items.length === 0 ? (
            <div className="border-line bg-surface-raised border p-8 text-center">
              <h2 className="display-sm">No encontramos productos</h2>
              <p className="body text-ink-muted mt-2">{activeCount > 0 || filters.q ? "Prueba quitando algún filtro o buscando otra cosa." : "Pronto tendremos novedades en esta sección."}</p>
              {(activeCount > 0 || filters.q) && (
                <Link href={buildHref(path, { ...filters, marca: undefined, min: undefined, max: undefined, q: undefined })} className="sb-btn sb-btn--primary mt-6">
                  Quitar filtros
                </Link>
              )}
            </div>
          ) : (
            <>
              <ProductGrid products={page.items} />
              <Pagination page={page.meta.page} totalPages={page.meta.total_pages} hrefFor={(n) => buildHref(path, filters, { pagina: n })} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
