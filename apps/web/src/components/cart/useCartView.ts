"use client";

import { isBlocking, useCartChecks } from "@/hooks/useCartChecks";
import { useCartStore } from "@/store/cart";

/**
 * Estado derivado del carrito para el drawer y la página. Los totales solo cuentan lo que de verdad se puede
 * comprar: lo agotado o retirado no suma, y una línea que pide más de lo que hay suma solo lo disponible.
 */
export function useCartView(active: boolean) {
  const lines = useCartStore((s) => s.lines);
  const checks = useCartChecks(active);

  let subtotal = 0;
  let units = 0;
  let blockingCount = 0;
  for (const l of lines) {
    const c = checks[l.variantId];
    if (isBlocking(c)) blockingCount++;
    if (c?.status === "soldout" || c?.status === "gone") continue;
    const qty = c?.status === "over" ? Math.min(l.quantity, c.available ?? l.quantity) : l.quantity;
    subtotal += l.unitPriceCOP * qty;
    units += qty;
  }
  return { lines, checks, subtotal, units, blockingCount };
}
