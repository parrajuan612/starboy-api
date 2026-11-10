import { api } from "@/lib/api-client";
import type { Paginated } from "@/types";

/** GET paginado: devuelve filas y meta (los atajos `http` solo desempacan `data`). */
export async function getPage<T>(url: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<Paginated<T>> {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
  return (await api.get<Paginated<T>>(url, { params: clean, signal })).data;
}
