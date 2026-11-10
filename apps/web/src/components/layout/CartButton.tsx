"use client";

import { ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";

import { useHydrated } from "@/hooks/useHydrated";
import { selectCount, useCartStore } from "@/store/cart";

/** El carrito se persiste en localStorage: se muestra solo tras hidratar para no desajustar el HTML. */
export function CartButton() {
  const count = useCartStore(selectCount);
  const setOpen = useCartStore((s) => s.setOpen);
  const hydrated = useHydrated();
  const pathname = usePathname();
  // En /carrito y /checkout el carrito ya está a la vista: el ícono no abre el drawer.
  const onCartPage = pathname.startsWith("/carrito") || pathname.startsWith("/checkout");

  return (
    <button
      type="button"
      onClick={() => !onCartPage && setOpen(true)}
      aria-haspopup={onCartPage ? undefined : "dialog"}
      aria-label={`Carrito${hydrated && count ? `, ${count} productos` : ""}`}
      className="relative inline-flex size-11 items-center justify-center"
    >
      <ShoppingBag strokeWidth={1.5} className="size-6" aria-hidden />
      {hydrated && count > 0 && (
        <span className="sb-badge sb-badge--discount absolute -top-0.5 -right-0.5 min-w-5 justify-center">{count}</span>
      )}
    </button>
  );
}
