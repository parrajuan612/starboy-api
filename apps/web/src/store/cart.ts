import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Línea del carrito. Los precios son solo para mostrar: el servidor recalcula todo en POST /orders. */
export interface CartLine {
  variantId: string;
  productSlug: string;
  name: string;
  size: string;
  sku: string;
  unitPriceCOP: number;
  imageUrl?: string;
  quantity: number;
}

export const MAX_PER_LINE = 10; // mismo tope que valida la API

interface CartState {
  lines: CartLine[];
  open: boolean;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
  /** Actualiza el precio guardado de las líneas cuando el catálogo cambió (variantId → precio vigente). */
  syncPrices: (prices: Record<string, number>) => void;
}

const clamp = (n: number) => Math.min(Math.max(Math.trunc(n), 1), MAX_PER_LINE);

/**
 * Lo guardado en localStorage no es de fiar (versiones viejas, edición a mano, datos corruptos):
 * se descarta lo que no tenga la forma esperada y se acota la cantidad.
 */
export function sanitizeLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CartLine[] = [];
  for (const l of raw as Partial<CartLine>[]) {
    if (
      !l || typeof l.variantId !== "string" || typeof l.productSlug !== "string" || typeof l.name !== "string" ||
      typeof l.size !== "string" || typeof l.sku !== "string" || !Number.isFinite(l.unitPriceCOP) || (l.unitPriceCOP as number) < 0 ||
      !Number.isFinite(l.quantity) || seen.has(l.variantId)
    ) {
      continue;
    }
    seen.add(l.variantId);
    out.push({
      variantId: l.variantId, productSlug: l.productSlug, name: l.name, size: l.size, sku: l.sku,
      unitPriceCOP: Math.trunc(l.unitPriceCOP as number), quantity: clamp(l.quantity as number),
      imageUrl: typeof l.imageUrl === "string" ? l.imageUrl : undefined,
    });
  }
  return out;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      open: false,
      add: (line, quantity = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.variantId === line.variantId);
          if (existing) {
            return {
              open: true,
              lines: s.lines.map((l) =>
                l.variantId === line.variantId ? { ...l, ...line, quantity: clamp(l.quantity + quantity) } : l,
              ),
            };
          }
          return { open: true, lines: [...s.lines, { ...line, quantity: clamp(quantity) }] };
        }),
      setQuantity: (variantId, quantity) =>
        set((s) => ({
          lines:
            quantity < 1
              ? s.lines.filter((l) => l.variantId !== variantId)
              : s.lines.map((l) => (l.variantId === variantId ? { ...l, quantity: clamp(quantity) } : l)),
        })),
      remove: (variantId) => set((s) => ({ lines: s.lines.filter((l) => l.variantId !== variantId) })),
      clear: () => set({ lines: [] }),
      setOpen: (open) => set({ open }),
      syncPrices: (prices) =>
        set((s) => {
          if (!s.lines.some((l) => prices[l.variantId] !== undefined && prices[l.variantId] !== l.unitPriceCOP)) return s;
          return { lines: s.lines.map((l) => (prices[l.variantId] !== undefined ? { ...l, unitPriceCOP: prices[l.variantId] } : l)) };
        }),
    }),
    {
      name: "sb-cart",
      partialize: (s) => ({ lines: s.lines }),
      merge: (persisted, current) => ({ ...current, lines: sanitizeLines((persisted as { lines?: unknown } | undefined)?.lines) }),
    },
  ),
);

export const selectCount = (s: CartState) => s.lines.reduce((n, l) => n + l.quantity, 0);
export const selectSubtotal = (s: CartState) => s.lines.reduce((n, l) => n + l.unitPriceCOP * l.quantity, 0);
