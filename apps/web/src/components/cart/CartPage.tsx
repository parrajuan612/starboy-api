"use client";

import Link from "next/link";
import { useState } from "react";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { useHydrated } from "@/hooks/useHydrated";
import { useCartStore } from "@/store/cart";

import { CartLineItem } from "./CartLineItem";
import { CartSummary } from "./CartSummary";
import { EmptyCart } from "./EmptyCart";
import { FreeShippingBar } from "./FreeShippingBar";
import { useCartView } from "./useCartView";

/** Página /carrito: lista detallada a la izquierda y resumen de pedido a la derecha (debajo en móvil). */
export function CartPage() {
  const hydrated = useHydrated();
  const clear = useCartStore((s) => s.clear);
  const { lines, checks, subtotal, units, blockingCount } = useCartView(true);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Carrito" }]} />
      <h1 className="display-lg mt-4 mb-8">Tu carrito</h1>

      {!hydrated ? (
        <div role="status" className="body text-ink-muted py-16">
          Cargando tu carrito…
        </div>
      ) : lines.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-12">
          <section aria-label="Productos">
            <div className="border-line mb-2 border p-4">
              <FreeShippingBar subtotal={subtotal} />
            </div>
            <ul className="divide-line divide-y" aria-label="Productos en el carrito">
              {lines.map((l) => (
                <CartLineItem key={l.variantId} line={l} check={checks[l.variantId]} />
              ))}
            </ul>
            <div className="border-line mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Link href="/productos" className="body-sm text-ink hover:underline underline-offset-4">
                ← Seguir comprando
              </Link>
              {confirmClear ? (
                <p className="body-sm flex items-center gap-3" role="group" aria-label="Confirmar vaciar carrito">
                  ¿Vaciar el carrito?
                  <button type="button" onClick={() => { clear(); setConfirmClear(false); }} className="text-danger inline-flex min-h-11 items-center underline underline-offset-4">
                    Sí, vaciar
                  </button>
                  <button type="button" onClick={() => setConfirmClear(false)} className="inline-flex min-h-11 items-center underline underline-offset-4">
                    Cancelar
                  </button>
                </p>
              ) : (
                <button type="button" onClick={() => setConfirmClear(true)} className="body-sm text-ink-muted hover:text-ink inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                  Vaciar carrito
                </button>
              )}
            </div>
          </section>

          <aside aria-labelledby="summary-title" className="bg-surface-raised border-line mt-8 border p-5 lg:sticky lg:top-24 lg:mt-0">
            <h2 id="summary-title" className="display-sm mb-4">
              Resumen de pedido
            </h2>
            <CartSummary subtotal={subtotal} units={units} blockingCount={blockingCount} />
          </aside>
        </div>
      )}
    </div>
  );
}
