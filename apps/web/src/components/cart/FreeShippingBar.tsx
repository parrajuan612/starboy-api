import { CheckCircle2, Truck } from "lucide-react";

import { formatCOP } from "@/lib/format";
import { FREE_SHIPPING_FROM_COP } from "@/lib/site";

/** Barra de progreso hacia el envío gratis (§12.8): relleno `brand` y mensaje con lo que falta. */
export function FreeShippingBar({ subtotal }: { subtotal: number }) {
  const remaining = Math.max(FREE_SHIPPING_FROM_COP - subtotal, 0);
  const reached = remaining === 0;
  const pct = Math.min(Math.round((subtotal / FREE_SHIPPING_FROM_COP) * 100), 100);

  return (
    <div className="space-y-2">
      <p className="body-sm flex items-center gap-2" aria-live="polite">
        {reached ? <CheckCircle2 className="text-success size-5 shrink-0" strokeWidth={1.5} aria-hidden /> : <Truck className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />}
        {reached ? (
          <span className="text-success font-semibold">¡Tienes envío GRATIS!</span>
        ) : (
          <span>
            ¡Te faltan <strong className="font-semibold tabular-nums">{formatCOP(remaining)}</strong> para obtener envío GRATIS!
          </span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Progreso hacia el envío gratis"
        aria-valuemin={0}
        aria-valuemax={FREE_SHIPPING_FROM_COP}
        aria-valuenow={Math.min(subtotal, FREE_SHIPPING_FROM_COP)}
        aria-valuetext={`${pct} %`}
        className="bg-line h-2 w-full overflow-hidden"
      >
        <div className="bg-brand h-full transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
