import { AlertCircle } from "lucide-react";
import Link from "next/link";

import { ProductImage } from "@/components/product/ProductImage";
import type { LineCheck } from "@/hooks/useCartChecks";
import { formatCOP } from "@/lib/format";
import type { CartLine } from "@/store/cart";

/** Resumen de pedido del checkout: prendas ya validadas contra el catálogo, subtotal y total estimado. */
export function CheckoutSummary({
  lines,
  checks,
  subtotal,
  units,
  blockingCount,
  children,
}: {
  lines: CartLine[];
  checks: Record<string, LineCheck>;
  subtotal: number;
  units: number;
  blockingCount: number;
  /** Botón de confirmar (queda dentro de la tarjeta). */
  children: React.ReactNode;
}) {
  return (
    <aside aria-labelledby="co-summary" className="bg-surface-raised border-line border p-5 lg:sticky lg:top-24">
      <h2 id="co-summary" className="display-sm mb-4">
        Resumen de tu pedido
      </h2>

      <ul className="divide-line divide-y" aria-label="Productos del pedido">
        {lines.map((l) => {
          const c = checks[l.variantId];
          const bad = c?.status === "soldout" || c?.status === "gone" || c?.status === "over";
          return (
            <li key={l.variantId} className="flex gap-3 py-3">
              <div className="bg-sb-white border-line relative size-16 shrink-0 border">
                {l.imageUrl && <ProductImage src={l.imageUrl} alt="" sizes="64px" className={bad ? "opacity-40" : ""} />}
                <span className="bg-ink text-surface-raised absolute -top-2 -right-2 inline-flex min-w-5 items-center justify-center px-1 text-[11px] font-semibold" aria-hidden>
                  {l.quantity}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="body-sm">{l.name}</p>
                <p className="caption text-ink-muted">
                  Talla {l.size} · {l.quantity} {l.quantity === 1 ? "unidad" : "unidades"}
                </p>
                {bad && (
                  <p className="text-danger caption mt-1 flex items-start gap-1" role="status">
                    <AlertCircle className="mt-px size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                    {c?.status === "over" ? `Solo quedan ${c.available}.` : "Ya no está disponible."}
                  </p>
                )}
              </div>
              <p className="body-sm shrink-0 tabular-nums">{formatCOP(l.unitPriceCOP * l.quantity)}</p>
            </li>
          );
        })}
      </ul>

      <dl className="body mt-2 space-y-2">
        <div className="border-line flex justify-between gap-4 border-t pt-4">
          <dt className="text-ink-muted">
            Subtotal ({units} {units === 1 ? "producto" : "productos"})
          </dt>
          <dd className="tabular-nums">{formatCOP(subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Envío</dt>
          <dd className="text-ink-muted">Se confirma al crear tu orden</dd>
        </div>
        <div className="border-line flex items-baseline justify-between gap-4 border-t pt-3">
          <dt className="body-strong">Total estimado</dt>
          <dd className="price-lg tabular-nums">{formatCOP(subtotal)}</dd>
        </div>
      </dl>

      {blockingCount > 0 && (
        <p role="alert" className="text-danger body-sm mt-4 flex items-start gap-1.5">
          <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          <span>
            Hay productos que ya no están disponibles.{" "}
            <Link href="/carrito" className="text-ink underline underline-offset-4">
              Revisa tu carrito
            </Link>
            .
          </span>
        </p>
      )}

      <div className="mt-5 space-y-3">{children}</div>
    </aside>
  );
}
