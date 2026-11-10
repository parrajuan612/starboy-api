import "server-only";

import type { Brand, Category, PageMeta, ProductDetail, ProductSummary } from "@/types";

const API = process.env.API_URL ?? "http://localhost:8082";

/** Segundos que se cachean menú y listados. Cambiar algo en el admin tarda como máximo esto en verse. */
export const MENU_REVALIDATE = 300;
const LISTING_REVALIDATE = 60;

type Result<T> = { ok: true; data: T } | { ok: false; status: number };

async function request<T>(path: string, revalidate: number): Promise<Result<T>> {
  try {
    const res = await fetch(`${API}/api/v1${path}`, { next: { revalidate }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 }; // API caída o sin respuesta
  }
}

async function getData<T>(path: string, revalidate: number): Promise<T | null> {
  const r = await request<{ data: T }>(path, revalidate);
  return r.ok ? r.data.data : null;
}

export interface MenuSource {
  categories: Category[];
  brands: Brand[];
}

export async function getMenuSource(): Promise<MenuSource> {
  const [categories, brands] = await Promise.all([
    getData<Category[]>("/categories", MENU_REVALIDATE),
    getData<Brand[]>("/brands", MENU_REVALIDATE),
  ]);
  return { categories: categories ?? [], brands: brands ?? [] };
}

export interface ProductPage {
  items: ProductSummary[];
  meta: PageMeta;
}

/** null = la API falló (la pantalla muestra un error con reintento, no «sin resultados»). */
export async function getProducts(query: URLSearchParams): Promise<ProductPage | null> {
  const r = await request<{ data: ProductSummary[]; meta: PageMeta }>(`/products?${query.toString()}`, LISTING_REVALIDATE);
  if (!r.ok) return null;
  return { items: r.data.data, meta: r.data.meta };
}

/** "notfound" si el slug no existe (o no está publicado); null si la API no responde. */
export async function getProduct(slug: string): Promise<ProductDetail | "notfound" | null> {
  const r = await request<{ data: ProductDetail }>(`/products/${encodeURIComponent(slug)}`, LISTING_REVALIDATE);
  if (r.ok) return r.data.data;
  return r.status === 404 ? "notfound" : null;
}
