"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { Pager } from "@/components/admin/Pager";
import { Alert } from "@/components/ui";
import { useDebounced } from "@/hooks/useDebounced";
import { usePagedList } from "@/hooks/usePagedList";
import { formatDate } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import type { InventoryMovement, MovementType, StockRow } from "@/types";

type Tab = "stock" | "log";

const TYPE_LABEL: Record<MovementType, string> = {
  RESERVE: "Reserva",
  RELEASE: "Liberación",
  COMMIT: "Venta",
  RESTOCK: "Reposición",
  ADJUSTMENT: "Ajuste",
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function InventoryAdmin() {
  const [tab, setTab] = useState<Tab>("stock");
  const [variant, setVariant] = useState<{ id: string; label: string } | null>(null);
  const base = useId();

  const tabs: { id: Tab; label: string }[] = [
    { id: "stock", label: "Stock por variante" },
    { id: "log", label: "Bitácora de movimientos" },
  ];

  return (
    <section aria-labelledby="inv-title">
      <h1 id="inv-title" className="display-md">
        Inventario
      </h1>

      <div role="tablist" aria-label="Inventario" className="border-line mt-6 flex overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`${base}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${base}-panel`}
            type="button"
            onClick={() => setTab(t.id)}
            className={`label min-h-11 border-b-2 px-4 whitespace-nowrap ${tab === t.id ? "border-brand text-ink" : "text-ink-muted hover:text-ink border-transparent"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-${tab}`} className="mt-6">
        {tab === "stock" ? (
          <StockTable
            onHistory={(r) => {
              setVariant({ id: r.variant_id, label: `${r.product_name} · ${r.size}` });
              setTab("log");
            }}
          />
        ) : (
          <MovementsTable variant={variant} onClearVariant={() => setVariant(null)} />
        )}
      </div>
    </section>
  );
}

function StockTable({ onHistory }: { onHistory: (r: StockRow) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim());
  const { rows, meta, loading, error } = usePagedList<StockRow>("/admin/inventory/stock", { q: dq, filter }, page, 50);
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN"); // solo ADMIN edita productos y stock

  return (
    <div>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="st-q" className="sr-only">Buscar producto, marca o SKU</label>
          <Search className="text-ink-muted pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2" strokeWidth={1.5} aria-hidden />
          <input id="st-q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Producto, marca o SKU" className="sb-input pl-10" />
        </div>
        <div>
          <label htmlFor="st-f" className="sr-only">Disponibilidad</label>
          <select id="st-f" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="sb-input sm:w-56">
            <option value="">Todo el stock</option>
            <option value="low">Poco stock (1 a 3)</option>
            <option value="out">Agotado</option>
          </select>
        </div>
      </form>

      <div className="mt-6" aria-busy={loading}>
        {error && <Alert>{error}</Alert>}
        {!error && !loading && rows.length === 0 && <p className="body text-ink-muted border-line border border-dashed p-8 text-center">No hay variantes con esos filtros.</p>}

        {rows.length > 0 && (
          <>
            <div className="border-line hidden overflow-x-auto border md:block">
              <table className="body-sm w-full text-left">
                <caption className="sr-only">Stock por variante</caption>
                <thead className="bg-surface-raised border-line border-b">
                  <tr className="label">
                    <th scope="col" className="p-3">Producto</th>
                    <th scope="col" className="p-3">SKU</th>
                    <th scope="col" className="p-3">Talla</th>
                    <th scope="col" className="p-3 text-right">En bodega</th>
                    <th scope="col" className="p-3 text-right">Reservado</th>
                    <th scope="col" className="p-3 text-right">Disponible</th>
                    <th scope="col" className="p-3"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-line bg-surface-raised divide-y">
                  {rows.map((r) => (
                    <tr key={r.variant_id}>
                      <th scope="row" className="p-3 font-normal">
                        <span className="body-strong block">{r.product_name}</span>
                        <span className="text-ink-muted block">{r.brand}{r.product_status !== "ACTIVE" ? ` · ${r.product_status === "DRAFT" ? "Borrador" : "Archivado"}` : ""}</span>
                      </th>
                      <td className="p-3 font-mono text-xs">{r.sku}</td>
                      <td className="p-3">{r.size}</td>
                      <td className="p-3 text-right tabular-nums">{r.stock_on_hand}</td>
                      <td className="p-3 text-right tabular-nums">{r.stock_reserved}</td>
                      <td className="p-3 text-right"><Availability n={r.available} /></td>
                      <td className="p-3 text-right">
                        <button type="button" onClick={() => onHistory(r)} className="label hover:text-accent min-h-11" aria-label={`Ver movimientos de ${r.product_name} talla ${r.size}`}>
                          Movimientos
                        </button>
                        {isAdmin && (
                          <Link href={`/admin/productos/${r.product_id}`} className="label hover:text-accent ml-2 inline-flex min-h-11 items-center" aria-label={`Editar stock de ${r.product_name}`}>
                            Editar
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 md:hidden">
              {rows.map((r) => (
                <li key={r.variant_id} className="bg-surface-raised border-line border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="body-strong">{r.product_name}</p>
                      <p className="caption text-ink-muted">{r.brand} · Talla {r.size}</p>
                      <p className="caption text-ink-muted font-mono break-all">{r.sku}</p>
                    </div>
                    <Availability n={r.available} />
                  </div>
                  <p className="body-sm text-ink-muted mt-2">En bodega {r.stock_on_hand} · Reservado {r.stock_reserved}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <button type="button" onClick={() => onHistory(r)} className="sb-btn sb-btn--secondary w-full">Ver movimientos</button>
                    {isAdmin && <Link href={`/admin/productos/${r.product_id}`} className="sb-btn sb-btn--secondary w-full">Editar producto y stock</Link>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {meta && <Pager page={meta.page} totalPages={meta.total_pages} total={meta.total} onPage={setPage} disabled={loading} />}
      </div>
    </div>
  );
}

function Availability({ n }: { n: number }) {
  if (n <= 0) return <span className="sb-badge sb-badge--danger">Agotado</span>;
  if (n <= 3) return <span className="sb-badge sb-badge--neutral">Quedan {n}</span>;
  return <span className="body-sm tabular-nums">{n}</span>;
}

function MovementsTable({ variant, onClearVariant }: { variant: { id: string; label: string } | null; onClearVariant: () => void }) {
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const { rows, meta, loading, error } = usePagedList<InventoryMovement>("/admin/inventory/movements", { type, variant_id: variant?.id }, page, 30);

  return (
    <div>
      <p className="body-sm text-ink-muted mb-4">Registro inmutable: cada reserva, venta, liberación y ajuste queda anotado y no se puede editar ni borrar.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div>
          <label htmlFor="mv-t" className="sr-only">Tipo de movimiento</label>
          <select id="mv-t" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="sb-input sm:w-56">
            <option value="">Todos los tipos</option>
            {(Object.keys(TYPE_LABEL) as MovementType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        {variant && (
          <p className="body-sm flex flex-wrap items-center gap-2">
            Filtrando por <span className="body-strong">{variant.label}</span>
            <button type="button" onClick={() => { onClearVariant(); setPage(1); }} className="label hover:text-accent min-h-11 underline underline-offset-4">Quitar filtro</button>
          </p>
        )}
      </div>

      <div className="mt-6" aria-busy={loading}>
        {error && <Alert>{error}</Alert>}
        {!error && !loading && rows.length === 0 && <p className="body text-ink-muted border-line border border-dashed p-8 text-center">Todavía no hay movimientos.</p>}

        {rows.length > 0 && (
          <>
            <div className="border-line hidden overflow-x-auto border md:block">
              <table className="body-sm w-full text-left">
                <caption className="sr-only">Bitácora de movimientos de inventario</caption>
                <thead className="bg-surface-raised border-line border-b">
                  <tr className="label">
                    <th scope="col" className="p-3">Fecha</th>
                    <th scope="col" className="p-3">Tipo</th>
                    <th scope="col" className="p-3">Variante</th>
                    <th scope="col" className="p-3 text-right">Bodega</th>
                    <th scope="col" className="p-3 text-right">Reservado</th>
                    <th scope="col" className="p-3">Orden</th>
                    <th scope="col" className="p-3">Quién y por qué</th>
                  </tr>
                </thead>
                <tbody className="divide-line bg-surface-raised divide-y">
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td className="p-3 whitespace-nowrap">{formatDate(m.created_at)}</td>
                      <td className="p-3"><span className="sb-badge sb-badge--neutral">{TYPE_LABEL[m.type]}</span></td>
                      <td className="p-3">
                        <span className="body-strong block">{m.product_name}</span>
                        <span className="text-ink-muted block">Talla {m.size} · <span className="font-mono text-xs">{m.sku}</span></span>
                      </td>
                      <td className="p-3 text-right tabular-nums">{signed(m.delta_on_hand)} <span className="text-ink-muted">→ {m.on_hand_after}</span></td>
                      <td className="p-3 text-right tabular-nums">{signed(m.delta_reserved)} <span className="text-ink-muted">→ {m.reserved_after}</span></td>
                      <td className="p-3 whitespace-nowrap">{m.order_code ?? "—"}</td>
                      <td className="p-3">
                        <span className="block">{m.actor_name || "Proceso automático"}</span>
                        {m.reason && <span className="text-ink-muted block">{m.reason}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 md:hidden">
              {rows.map((m) => (
                <li key={m.id} className="bg-surface-raised border-line border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="sb-badge sb-badge--neutral">{TYPE_LABEL[m.type]}</span>
                    <p className="caption text-ink-muted">{formatDate(m.created_at)}</p>
                  </div>
                  <p className="body-strong mt-2">{m.product_name}</p>
                  <p className="caption text-ink-muted">Talla {m.size} · {m.sku}</p>
                  <p className="body-sm mt-2 tabular-nums">Bodega {signed(m.delta_on_hand)} → {m.on_hand_after} · Reservado {signed(m.delta_reserved)} → {m.reserved_after}</p>
                  <p className="caption text-ink-muted mt-1">{m.order_code ? `${m.order_code} · ` : ""}{m.actor_name || "Proceso automático"}{m.reason ? ` · ${m.reason}` : ""}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        {meta && <Pager page={meta.page} totalPages={meta.total_pages} total={meta.total} onPage={setPage} disabled={loading} />}
      </div>
    </div>
  );
}
