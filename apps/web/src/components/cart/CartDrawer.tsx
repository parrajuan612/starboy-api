"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useHydrated } from "@/hooks/useHydrated";
import { selectCount, useCartStore } from "@/store/cart";

import { CartLineItem } from "./CartLineItem";
import { CartSummary } from "./CartSummary";
import { EmptyCart } from "./EmptyCart";
import { FreeShippingBar } from "./FreeShippingBar";
import { useCartView } from "./useCartView";

/**
 * Drawer lateral del carrito (§12.8). Se abre con el ícono del header y al agregar desde la ficha de producto
 * (ambos ponen `open` en el store). Es un <dialog> modal: foco atrapado, Escape y velo cierran, y el foco
 * vuelve al elemento que lo abrió.
 */
export function CartDrawer() {
  const dialog = useRef<HTMLDialogElement>(null);
  const hydrated = useHydrated();
  const open = useCartStore((s) => s.open);
  const setOpen = useCartStore((s) => s.setOpen);
  const count = useCartStore(selectCount);
  const pathname = usePathname();
  const { lines, checks, subtotal, units, blockingCount } = useCartView(open);

  // Store → <dialog>
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open, hydrated]);

  // Navegar (también con «atrás») cierra el drawer.
  useEffect(() => {
    useCartStore.getState().setOpen(false);
  }, [pathname]);

  if (!hydrated) return null;
  const close = () => setOpen(false);

  return (
    <dialog
      ref={dialog}
      aria-label="Carrito de compras"
      onClose={close} // Escape o cierre nativo → el store se entera
      onClick={(e) => e.target === dialog.current && close()} // clic en el velo
      className="sb-filterdrawer bg-surface-raised text-ink shadow-drawer fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(100vw,440px)] max-w-none flex-col p-0 backdrop:bg-sb-ink/60 open:flex"
    >
      {open && (
        <>
        <div className="border-line flex h-16 shrink-0 items-center justify-between border-b px-4">
          <h2 className="display-sm">Tu carrito{count > 0 ? ` (${count})` : ""}</h2>
          <button type="button" aria-label="Cerrar carrito" onClick={close} className="inline-flex size-11 items-center justify-center">
            <X className="size-6" strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        {lines.length === 0 ? (
          <EmptyCart compact onNavigate={close} />
        ) : (
          <>
            <div className="border-line shrink-0 border-b p-4">
              <FreeShippingBar subtotal={subtotal} />
            </div>
            <ul className="divide-line flex-1 divide-y overflow-y-auto px-4" aria-label="Productos en el carrito">
              {lines.map((l) => (
                <CartLineItem key={l.variantId} line={l} check={checks[l.variantId]} onNavigate={close} />
              ))}
            </ul>
            <div className="border-line bg-surface-raised shrink-0 border-t p-4">
              <CartSummary subtotal={subtotal} units={units} blockingCount={blockingCount} onNavigate={close} showCartLink />
            </div>
          </>
        )}
        </>
      )}
    </dialog>
  );
}
