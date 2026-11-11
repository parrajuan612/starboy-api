"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { Pager } from "@/components/admin/Pager";
import { Alert } from "@/components/ui";
import { usePagedList } from "@/hooks/usePagedList";
import { formatCOP, formatDate } from "@/lib/format";
import type { Payment, PaymentStatus } from "@/types";

const STATUS: Record<PaymentStatus, { label: string; badge: string }> = {
  PENDING: { label: "Pendiente", badge: "sb-badge--neutral" },
  IN_REVIEW: { label: "En revisión", badge: "sb-badge--danger" },
  APPROVED: { label: "Aprobado", badge: "sb-badge--success" },
  DECLINED: { label: "Rechazado", badge: "sb-badge--neutral" },
  REFUNDED: { label: "Reembolsado", badge: "sb-badge--neutral" },
};
const KIND: Record<string, string> = { FULL: "Compra", DEPOSIT: "Anticipo de encargo", BALANCE: "Saldo de encargo" };
const PROVIDER: Record<string, string> = { SANDBOX: "Pasarela de pruebas", MERCADOPAGO: "Mercado Pago", BANK_TRANSFER: "Transferencia", CASH_ON_DELIVERY: "Contra entrega" };

/** Bandeja de pagos: todo lo que pasó por una pasarela, con foco en los que están «en revisión». Solo lectura. */
export function PaymentsAdmin() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { rows, meta, loading, error } = usePagedList<Payment>("/admin/payments", { status }, page, 20);

  return (
    <section aria-labelledby="pay-title">
      <h1 id="pay-title" className="display-md">
        Pagos
      </h1>
      <p className="body text-ink-muted mt-2 max-w-2xl">Cada cobro de la tienda y de los encargos, con la pasarela que lo procesó.</p>

      <div className="bg-surface-raised border-line mt-6 flex items-start gap-3 border p-4">
        <AlertTriangle className="text-danger mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
        <p className="body-sm">
          <span className="body-strong">«En revisión»</span> es un pago que la pasarela aprobó pero que no pudo aplicarse solo: por ejemplo, llegó cuando la reserva del pedido ya había vencido o el encargo estaba en otro estado. El dinero está registrado, pero hay que revisarlo a mano con el cliente (y reembolsar o reactivar la compra).
        </p>
      </div>

      <div className="mt-6">
        <label htmlFor="pay-s" className="sr-only">Estado del pago</label>
        <select id="pay-s" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sb-input sm:w-60">
          <option value="">Todos los estados</option>
          {(Object.keys(STATUS) as PaymentStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS[s].label}</option>
          ))}
        </select>
      </div>

      <div className="mt-6" aria-busy={loading}>
        {error && <Alert>{error}</Alert>}
        {!error && !loading && rows.length === 0 && <p className="body text-ink-muted border-line border border-dashed p-8 text-center">No hay pagos con ese filtro.</p>}
        {rows.length > 0 && (
          <>
            <div className="border-line hidden overflow-x-auto border md:block">
              <table className="body-sm w-full text-left">
                <caption className="sr-only">Pagos</caption>
                <thead className="bg-surface-raised border-line border-b">
                  <tr className="label">
                    <th scope="col" className="p-3">Fecha</th>
                    <th scope="col" className="p-3">Referencia</th>
                    <th scope="col" className="p-3">Concepto</th>
                    <th scope="col" className="p-3">Pasarela</th>
                    <th scope="col" className="p-3 text-right">Monto</th>
                    <th scope="col" className="p-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-line bg-surface-raised divide-y">
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td className="p-3 whitespace-nowrap">{formatDate(p.created_at!)}</td>
                      <th scope="row" className="p-3 font-normal"><span className="body-strong">{p.target_code ?? "—"}</span></th>
                      <td className="p-3">{KIND[p.kind] ?? p.kind}</td>
                      <td className="p-3">{PROVIDER[p.provider] ?? p.provider}</td>
                      <td className="p-3 text-right tabular-nums whitespace-nowrap">{formatCOP(p.amount_cop)}</td>
                      <td className="p-3"><span className={`sb-badge ${STATUS[p.status].badge}`}>{STATUS[p.status].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul aria-label="Pagos" className="space-y-3 md:hidden">
              {rows.map((p) => (
                <li key={p.id} className="bg-surface-raised border-line border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="body-strong">{p.target_code ?? "—"} · {KIND[p.kind] ?? p.kind}</p>
                      <p className="caption text-ink-muted">{PROVIDER[p.provider] ?? p.provider} · {formatDate(p.created_at!)}</p>
                    </div>
                    <span className={`sb-badge ${STATUS[p.status].badge}`}>{STATUS[p.status].label}</span>
                  </div>
                  <p className="body-strong mt-2 tabular-nums">{formatCOP(p.amount_cop)}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        {meta && rows.length > 0 && <Pager page={page} totalPages={meta.total_pages} total={meta.total} onPage={setPage} disabled={loading} />}
      </div>
    </section>
  );
}
