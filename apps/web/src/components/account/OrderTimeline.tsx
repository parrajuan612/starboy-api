import { Check, XCircle } from "lucide-react";

import { formatDate } from "@/lib/format";
import { ORDER_STATUS_LABEL, ORDER_STEPS } from "@/lib/order-status";
import type { OrderHistoryEntry, OrderStatus } from "@/types";

interface Props {
  status: OrderStatus;
  /** Para mostrar la fecha de cada paso (solo vista completa). */
  history?: OrderHistoryEntry[];
  variant?: "compact" | "full";
}

/** Última vez que la orden entró a cada estado. */
function datesByStatus(history: OrderHistoryEntry[] = []): Partial<Record<OrderStatus, string>> {
  const out: Partial<Record<OrderStatus, string>> = {};
  for (const h of history) if (!out[h.status] || h.created_at > out[h.status]!) out[h.status] = h.created_at;
  return out;
}

/**
 * Línea de tiempo PENDING_PAYMENT ➔ PAID ➔ PROCESSING ➔ SHIPPED ➔ DELIVERED. Los pasos cumplidos llevan check
 * (no solo color) y el actual se anuncia con aria-current. Una orden cancelada no es un paso del camino feliz:
 * se muestra aparte, con su fecha.
 */
export function OrderTimeline({ status, history, variant = "full" }: Props) {
  if (status === "CANCELLED") {
    const when = datesByStatus(history).CANCELLED;
    return (
      <p className="sb-badge sb-badge--danger">
        <XCircle className="size-4" strokeWidth={1.5} aria-hidden />
        Cancelada{when && variant === "full" ? ` · ${formatDate(when)}` : ""}
      </p>
    );
  }

  const current = ORDER_STEPS.indexOf(status);
  const dates = variant === "full" ? datesByStatus(history) : {};

  if (variant === "compact") {
    return (
      <div>
        <ol className="flex items-center" aria-label="Progreso del pedido">
          {ORDER_STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center last:flex-none" aria-current={i === current ? "step" : undefined}>
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${i <= current ? "bg-brand border-brand text-on-brand" : "border-line-strong bg-surface-raised"}`}
              >
                {i < current && <Check className="size-3" strokeWidth={2.5} aria-hidden />}
                <span className="sr-only">{ORDER_STATUS_LABEL[s]}{i < current ? " (listo)" : i === current ? " (actual)" : ""}</span>
              </span>
              {i < ORDER_STEPS.length - 1 && <span className={`h-0.5 flex-1 ${i < current ? "bg-brand" : "bg-line-strong"}`} aria-hidden />}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <ol aria-label="Progreso del pedido" className="flex flex-col gap-0 md:flex-row">
      {ORDER_STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} aria-current={active ? "step" : undefined} className="relative flex gap-3 pb-6 last:pb-0 md:flex-1 md:flex-col md:gap-2 md:pb-0">
            {i < ORDER_STEPS.length - 1 && (
              <>
                <span aria-hidden className={`absolute top-6 left-[11px] h-[calc(100%-1.5rem)] w-0.5 md:hidden ${done ? "bg-brand" : "bg-line-strong"}`} />
                <span aria-hidden className={`absolute top-[11px] left-6 hidden h-0.5 w-[calc(100%-1.5rem)] md:block ${done ? "bg-brand" : "bg-line-strong"}`} />
              </>
            )}
            <span
              className={`relative flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${done || active ? "bg-brand border-brand text-on-brand" : "border-line-strong bg-surface-raised"}`}
            >
              {done && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}
            </span>
            <span className="pr-2">
              <span className={`body-sm block ${active ? "text-ink font-semibold" : done ? "text-ink" : "text-ink-muted"}`}>{ORDER_STATUS_LABEL[s]}</span>
              <span className="caption text-ink-muted block">{dates[s] ? formatDate(dates[s]!) : done || active ? "" : "Pendiente"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
