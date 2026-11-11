import type { Gender, ProductOrigin, ProductStatus } from "@/types";

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = { DRAFT: "Borrador", ACTIVE: "Publicado", ARCHIVED: "Archivado" };
export const productBadge = (s: ProductStatus) => (s === "ACTIVE" ? "sb-badge--success" : s === "ARCHIVED" ? "sb-badge--danger" : "sb-badge--neutral");

export const GENDER_LABEL: Record<Gender, string> = { MEN: "Hombre", WOMEN: "Mujer", UNISEX: "Unisex" };
export const ORIGIN_LABEL: Record<ProductOrigin, string> = { LOCAL: "Stock propio", IMPORTED_STOCK: "Importado (ya en Colombia)" };

/** "399.900", "$ 399,900" o "399900" → 399900. Vacío → 0. null si no es un número entero válido. */
export function parseCOP(raw: string): number | null {
  const digits = raw.replace(/[\s$.,]/g, "");
  if (digits === "") return 0;
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

/** Entero no negativo desde un campo de texto; null si no lo es. */
export function parseCount(raw: string): number | null {
  const t = raw.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}
