import { Check, XCircle } from "lucide-react";

import { formatDate } from "@/lib/format";
import { IMPORT_LABEL } from "@/lib/import-status";
import type { ImportHistory, ImportStatus } from "@/types";

/** Camino feliz del encargo. Aduana y saldo pendiente son paradas intermedias: se ven en el historial y en la etiqueta del estado. */
export const IMPORT_STEPS: ImportStatus[] = [
  "REQUESTED", "QUOTED", "ACCEPTED", "PAID", "PURCHASED", "IN_US_WAREHOUSE", "IN_TRANSIT", "IN_CO_WAREHOUSE", "OUT_FOR_DELIVERY", "DELIVERED",
];

/** Paso del camino feliz en el que está el encargo (aduana cuenta como tránsito; saldo, como bodega en Colombia). */
function stepIndex(status: ImportStatus, history: ImportHistory[] = []): number {
  if (status === "IN_CUSTOMS") return IMPORT_STEPS.indexOf("IN_TRANSIT");
  if (status === "BALANCE_DUE") return IMPORT_STEPS.indexOf("IN_CO_WAREHOUSE");
  const i = IMPORT_STEPS.indexOf(status);
  if (i >= 0) return i;
  // REJECTED / EXPIRED / CANCELLED: se muestra hasta donde llegó.
  const reached = history.map((h) => IMPORT_STEPS.indexOf(h.status === "IN_CUSTOMS" ? "IN_TRANSIT" : h.status === "BALANCE_DUE" ? "IN_CO_WAREHOUSE" : h.status)).filter((n) => n >= 0);
  return reached.length ? Math.max(...reached) : 0;
}

function datesByStatus(history: ImportHistory[] = []): Partial<Record<ImportStatus, string>> {
  const out: Partial<Record<ImportStatus, string>> = {};
  for (const h of history) if (!out[h.status] || h.created_at > out[h.status]!) out[h.status] = h.created_at;
  return out;
}

const CLOSED: Partial<Record<ImportStatus, string>> = { REJECTED: "Rechazada", EXPIRED: "Cotización vencida", CANCELLED: "Cancelada" };

/**
 * Línea de tiempo vertical (cabe en 375 px sin desplazarse). Los pasos cumplidos llevan check, no solo color,
 * y el actual se anuncia con aria-current. Un encargo cerrado sin entregar muestra su cierre aparte.
 */
export function ImportTimeline({ status, history }: { status: ImportStatus; history?: ImportHistory[] }) {
  const dates = datesByStatus(history);
  const closed = CLOSED[status];
  const current = stepIndex(status, history);
  const delivered = status === "DELIVERED";

  return (
    <div className="space-y-4">
      {closed && (
        <p className="sb-badge sb-badge--danger">
          <XCircle className="size-4" strokeWidth={1.5} aria-hidden />
          {closed}
          {dates[status] ? ` · ${formatDate(dates[status]!)}` : ""}
        </p>
      )}
      <ol aria-label="Progreso del encargo" className="flex flex-col">
        {IMPORT_STEPS.map((s, i) => {
          const done = i < current || delivered;
          const active = i === current && !closed && !delivered;
          const stopped = i === current && !!closed;
          return (
            <li key={s} aria-current={active ? "step" : undefined} className="relative flex gap-3 pb-5 last:pb-0">
              {i < IMPORT_STEPS.length - 1 && <span aria-hidden className={`absolute top-6 left-[11px] h-[calc(100%-1.5rem)] w-0.5 ${i < current || delivered ? "bg-brand" : "bg-line-strong"}`} />}
              <span className={`relative flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${done || active ? "bg-brand border-brand text-on-brand" : stopped ? "border-danger bg-surface-raised" : "border-line-strong bg-surface-raised"}`}>
                {done && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className={`body-sm block ${active ? "text-ink font-semibold" : done ? "text-ink" : "text-ink-muted"}`}>
                  {IMPORT_LABEL[s]}
                  {active && s !== status && <span className="text-ink-muted font-normal"> · ahora: {IMPORT_LABEL[status]}</span>}
                </span>
                <span className="caption text-ink-muted block">{dates[s] ? formatDate(dates[s]!) : done || active || stopped ? "" : "Pendiente"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
