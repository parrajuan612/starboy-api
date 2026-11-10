import { AlertCircle, Lock } from "lucide-react";
import Link from "next/link";

import { formatCOP } from "@/lib/format";
import { FREE_SHIPPING_FROM_COP } from "@/lib/site";

interface Props {
  subtotal: number;
  units: number;
  blockingCount: number;
  /** Se llama al navegar (el drawer se cierra). */
  onNavigate?: () => void;
  /** Muestra el enlace «Ver carrito» (en el drawer). */
  showCartLink?: boolean;
}

/** Resumen de pedido. El envío real y los descuentos los calcula el servidor al crear la orden. */
export function CartSummary({ subtotal, units, blockingCount, onNavigate, showCartLink }: Props) {
  const freeShipping = subtotal >= FREE_SHIPPING_FROM_COP;
  const blocked = blockingCount > 0;

  return (
    <div className="space-y-4">
      <dl className="body space-y-2">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">
            Subtotal ({units} {units === 1 ? "producto" : "productos"})
          </dt>
          <dd className="tabular-nums">{formatCOP(subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Envío</dt>
          <dd className={freeShipping ? "text-success font-semibold" : "text-ink-muted"}>{freeShipping ? "Gratis" : "Se calcula al pagar"}</dd>
        </div>
        <div className="border-line flex items-baseline justify-between gap-4 border-t pt-3">
          <dt className="body-strong">Total estimado</dt>
          <dd className="price-lg tabular-nums">{formatCOP(subtotal)}</dd>
        </div>
      </dl>

      {blocked && (
        <p role="alert" className="text-danger body-sm flex items-start gap-1.5">
          <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          Elimina los productos que ya no están disponibles para continuar.
        </p>
      )}

      {blocked || subtotal === 0 ? (
        <button type="button" disabled className="sb-btn sb-btn--primary w-full">
          Ir a pagar
        </button>
      ) : (
        <Link href="/checkout" onClick={onNavigate} className="sb-btn sb-btn--primary w-full">
          Ir a pagar
        </Link>
      )}
      {showCartLink && (
        <Link href="/carrito" onClick={onNavigate} className="sb-btn sb-btn--secondary w-full">
          Ver carrito
        </Link>
      )}
      <p className="caption text-ink-muted flex items-center justify-center gap-1.5">
        <Lock className="size-3.5" strokeWidth={1.5} aria-hidden />
        Mercado Pago, transferencia o contra entrega.
      </p>
    </div>
  );
}
