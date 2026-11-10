import type { Category } from "@/types";

/**
 * URL <-> filtros del catálogo. Los parámetros de la URL van en español (?marca=nike&min=100000&orden=precio-asc&pagina=2)
 * y aquí se traducen a los de la API (brand, min_price, sort, page). Funciones puras, sin React.
 */
export const PAGE_SIZE = 12;

export const SORTS = [
  { value: "recientes", label: "Más recientes", api: "newest" },
  { value: "precio-asc", label: "Precio: menor a mayor", api: "price_asc" },
  { value: "precio-desc", label: "Precio: mayor a menor", api: "price_desc" },
] as const;

export type SortValue = (typeof SORTS)[number]["value"];

export interface Filters {
  marca?: string;
  min?: number;
  max?: number;
  orden: SortValue;
  pagina: number;
  q?: string;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function intParam(v: string | undefined, min: number, max: number): number | undefined {
  if (v === undefined || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}

/** Lee y sanea los parámetros: un valor inválido se ignora (nunca rompe la página). */
export function parseFilters(sp: RawSearchParams): Filters {
  const slug = (first(sp.marca) ?? "").toLowerCase();
  const orden = SORTS.find((s) => s.value === first(sp.orden))?.value ?? "recientes";
  let min = intParam(first(sp.min), 0, 100_000_000);
  let max = intParam(first(sp.max), 0, 100_000_000);
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  return {
    marca: /^[a-z0-9-]{1,100}$/.test(slug) ? slug : undefined,
    min,
    max,
    orden,
    pagina: intParam(first(sp.pagina), 1, 10_000) ?? 1,
    q: q || undefined,
  };
}

export interface Scope {
  gender?: "MEN" | "WOMEN";
  /** Slug de la categoría (raíz o hija) por la que se filtra. */
  category?: string;
  /** Marca fija de la ruta (/marcas/nike). */
  brand?: string;
}

/** Parámetros para GET /products. El género MEN/WOMEN ya incluye UNISEX en la API. */
export function toApiQuery(scope: Scope, f: Filters): URLSearchParams {
  const p = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(f.pagina), sort: SORTS.find((s) => s.value === f.orden)!.api });
  if (scope.gender) p.set("gender", scope.gender);
  if (scope.category) p.set("category", scope.category);
  const brand = scope.brand ?? f.marca;
  if (brand) p.set("brand", brand);
  if (f.min !== undefined) p.set("min_price", String(f.min));
  if (f.max !== undefined) p.set("max_price", String(f.max));
  if (f.q) p.set("q", f.q);
  return p;
}

/** Arma una URL conservando los filtros; `override` cambia o quita (undefined) valores. Reinicia la página salvo que se indique. */
export function buildHref(path: string, f: Filters, override: Partial<Record<keyof Filters, string | number | undefined>> = {}): string {
  const merged = { ...f, pagina: 1, ...override } as Record<string, string | number | undefined>;
  const p = new URLSearchParams();
  if (merged.q) p.set("q", String(merged.q));
  if (merged.marca) p.set("marca", String(merged.marca));
  if (merged.min !== undefined) p.set("min", String(merged.min));
  if (merged.max !== undefined) p.set("max", String(merged.max));
  if (merged.orden && merged.orden !== "recientes") p.set("orden", String(merged.orden));
  if (Number(merged.pagina) > 1) p.set("pagina", String(merged.pagina));
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

export interface CategoryMatch {
  /** Cadena raíz → hoja, ej. [Zapatos, Sneakers]. */
  chain: Category[];
}

/** Valida los segmentos de la URL contra el árbol (/zapatos/sneakers). null = la ruta no existe. */
export function resolveCategoryPath(tree: Category[], segments: string[]): CategoryMatch | null {
  const chain: Category[] = [];
  let level = tree;
  for (const seg of segments) {
    const hit = level.find((c) => c.slug === seg);
    if (!hit) return null;
    chain.push(hit);
    level = hit.children;
  }
  return { chain };
}

/** Cadena de categorías (raíz → hoja) que lleva a un slug. [] si no está en el árbol. */
export function findCategoryChain(tree: Category[], slug: string, trail: Category[] = []): Category[] {
  for (const c of tree) {
    const next = [...trail, c];
    if (c.slug === slug) return next;
    const deeper = findCategoryChain(c.children, slug, next);
    if (deeper.length) return deeper;
  }
  return [];
}

export const GENDER_LABEL = { MEN: "Hombre", WOMEN: "Mujer", UNISEX: "Unisex" } as const;
