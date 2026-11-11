"use client";

import { Loader2, Plane } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Alert, Button, ButtonLink } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { formatCOP, formatDate } from "@/lib/format";
import { importBadge } from "@/lib/import-status";
import { importPath, listMyImports } from "@/lib/imports";
import type { ImportRequest } from "@/types";

/** «Jordan 1 Retro (US 9) × 1 y 1 más». */
function summary(r: ImportRequest, max = 2): string {
  const items = r.items ?? [];
  if (items.length === 0) return `${r.item_count} ${r.item_count === 1 ? "producto" : "productos"}`;
  const parts = items.slice(0, max).map((i) => `${i.description}${i.size ? ` (${i.size})` : ""} × ${i.quantity}`);
  const rest = items.length - max;
  return rest > 0 ? `${parts.join(", ")} y ${rest} más` : parts.join(", ");
}

/** Qué tiene que hacer la persona ahora, si algo. */
function nextAction(r: ImportRequest): { label: string; text: string } | null {
  const q = r.quote;
  if (r.status === "QUOTED" && q && q.status === "SENT" && !q.is_expired) return { label: "Ver cotización", text: `Tu cotización está lista: ${formatCOP(q.total_cop)}. Vence el ${formatDate(q.valid_until)}.` };
  if (r.status === "ACCEPTED" && q) return { label: "Pagar anticipo", text: `Falta tu anticipo de ${formatCOP(q.deposit_cop)}.` };
  if (r.status === "BALANCE_DUE" && q) return { label: "Ver saldo", text: `Saldo pendiente: ${formatCOP(q.balance_cop)}.` };
  return null;
}

export function ImportsList() {
  const [items, setItems] = useState<ImportRequest[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMyImports(p);
      setItems((prev) => (p === 1 ? res.data : [...prev, ...res.data.filter((o) => !prev.some((x) => x.id === o.id))]));
      setPage(p);
      setTotalPages(res.meta.total_pages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No pudimos cargar tus encargos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos remotos
    void loadPage(1);
  }, [loadPage]);

  if (loading && items.length === 0) {
    return (
      <p role="status" className="body text-ink-muted flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando tus encargos…
      </p>
    );
  }
  if (error && items.length === 0) {
    return (
      <div className="max-w-xl space-y-4">
        <Alert>{error}</Alert>
        <Button variant="secondary" onClick={() => loadPage(1)}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="border-line border border-dashed p-10 text-center">
        <Plane className="text-ink-muted mx-auto size-10" strokeWidth={1.5} aria-hidden />
        <h2 className="display-sm mt-3">Aún no tienes encargos</h2>
        <p className="body text-ink-muted mt-1">Pídenos cualquier referencia de EE. UU. y te la traemos.</p>
        <ButtonLink href="/encargos-usa/cotizar" className="mt-6">
          Solicitar cotización
        </ButtonLink>
      </div>
    );
  }

  return (
    <section aria-labelledby="imports-title" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="imports-title" className="display-sm">
          Mis encargos
        </h2>
        <ButtonLink href="/encargos-usa/cotizar" variant="secondary">
          Nuevo encargo
        </ButtonLink>
      </div>
      <ul aria-label="Lista de encargos" className="space-y-4">
        {items.map((r) => {
          const action = nextAction(r);
          return (
            <li key={r.id} className="bg-surface-raised border-line border p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div>
                  <p className="body-strong">
                    <Link href={importPath(r.id)} className="hover:text-accent underline-offset-4 hover:underline">
                      {r.code}
                    </Link>
                  </p>
                  <p className="caption text-ink-muted">{formatDate(r.created_at)}</p>
                </div>
                <span className={`sb-badge ${importBadge(r.status)}`}>{r.status_label}</span>
              </div>
              <p className="body-sm text-ink-muted mt-3">{summary(r)}</p>
              {action && <p className="body-sm mt-3 font-semibold">{action.text}</p>}
              <div className="border-line mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="body">{r.quote ? <>Total <span className="body-strong tabular-nums">{formatCOP(r.quote.total_cop)}</span></> : <span className="text-ink-muted">Sin cotizar aún</span>}</p>
                <ButtonLink href={importPath(r.id)} variant={action ? "primary" : "secondary"}>
                  {action?.label ?? "Ver seguimiento"}
                </ButtonLink>
              </div>
            </li>
          );
        })}
      </ul>
      {error && <Alert>{error}</Alert>}
      {page < totalPages && (
        <div className="text-center">
          <Button variant="secondary" loading={loading} onClick={() => loadPage(page + 1)}>
            Ver más encargos
          </Button>
        </div>
      )}
    </section>
  );
}
