"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { OrderDetailPanel } from "@/components/admin/OrderDetailPanel";
import { Pager } from "@/components/admin/Pager";
import { Alert } from "@/components/ui";
import { useDebounced } from "@/hooks/useDebounced";
import { usePagedList } from "@/hooks/usePagedList";
import { formatCOP, formatDate } from "@/lib/format";
import { ORDER_BADGE, ORDER_STATUS_LABEL } from "@/lib/order-status";
import type { AdminOrder, OrderStatus } from "@/types";

const STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

/** Bandeja de órdenes: filtro por estado y por referencia/cliente, detalle y cambio de estado en un panel lateral. */
export function OrdersAdmin() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const dq = useDebounced(q.trim());
  const { rows, meta, loading, error, reload } = usePagedList<AdminOrder>("/admin/orders", { status, q: dq }, page);

  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <section aria-labelledby="ord-title">
      <h1 id="ord-title" className="display-md">
        Órdenes
      </h1>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="ord-q" className="sr-only">
            Buscar por referencia, nombre o correo
          </label>
          <Search className="text-ink-muted pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2" strokeWidth={1.5} aria-hidden />
          <input id="ord-q" type="search" value={q} onChange={(e) => set(setQ)(e.target.value)} placeholder="Referencia (SB-000123), nombre o correo" className="sb-input pl-10" />
        </div>
        <div>
          <label htmlFor="ord-status" className="sr-only">
            Estado
          </label>
          <select id="ord-status" value={status} onChange={(e) => set(setStatus)(e.target.value)} className="sb-input sm:w-56">
            <option value="">Todos los estados</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </form>

      <div className="mt-6" aria-busy={loading}>
        {error && <Alert>{error}</Alert>}
        {!error && rows.length === 0 && !loading && <p className="body text-ink-muted border-line border border-dashed p-8 text-center">No hay órdenes con esos filtros.</p>}

        {rows.length > 0 && (
          <>
            {/* Escritorio: tabla */}
            <div className="border-line hidden overflow-x-auto border md:block">
              <table className="body-sm w-full text-left">
                <caption className="sr-only">Órdenes</caption>
                <thead className="bg-surface-raised border-line border-b">
                  <tr className="label">
                    <th scope="col" className="p-3">Referencia</th>
                    <th scope="col" className="p-3">Cliente</th>
                    <th scope="col" className="p-3">Fecha</th>
                    <th scope="col" className="p-3">Estado</th>
                    <th scope="col" className="p-3 text-right">Total</th>
                    <th scope="col" className="p-3"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-line bg-surface-raised divide-y">
                  {rows.map((o) => (
                    <tr key={o.id}>
                      <th scope="row" className="body-strong p-3 whitespace-nowrap">{o.code}</th>
                      <td className="p-3">
                        <span className="block">{o.customer_name}</span>
                        <span className="text-ink-muted block break-all">{o.customer_email}</span>
                      </td>
                      <td className="p-3 whitespace-nowrap">{formatDate(o.created_at)}</td>
                      <td className="p-3"><span className={`sb-badge ${ORDER_BADGE[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span></td>
                      <td className="p-3 text-right tabular-nums whitespace-nowrap">{formatCOP(o.total_cop)}</td>
                      <td className="p-3 text-right">
                        <button type="button" onClick={() => setOpenId(o.id)} aria-label={`Ver orden ${o.code}`} className="sb-btn sb-btn--secondary min-h-11">
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas */}
            <ul className="space-y-3 md:hidden">
              {rows.map((o) => (
                <li key={o.id} className="bg-surface-raised border-line border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="body-strong">{o.code}</p>
                    <span className={`sb-badge ${ORDER_BADGE[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                  </div>
                  <p className="body-sm mt-1">{o.customer_name}</p>
                  <p className="caption text-ink-muted break-all">{o.customer_email}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="body-sm text-ink-muted">{formatDate(o.created_at)}</p>
                    <p className="body-strong tabular-nums">{formatCOP(o.total_cop)}</p>
                  </div>
                  <button type="button" onClick={() => setOpenId(o.id)} aria-label={`Ver orden ${o.code}`} className="sb-btn sb-btn--secondary mt-3 w-full">
                    Ver detalle
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {meta && <Pager page={meta.page} totalPages={meta.total_pages} total={meta.total} onPage={setPage} disabled={loading} />}
      </div>

      <AdminDrawer open={openId !== null} title="Detalle de la orden" onClose={() => setOpenId(null)}>
        {openId && <OrderDetailPanel key={openId} id={openId} onChanged={reload} />}
      </AdminDrawer>
    </section>
  );
}
