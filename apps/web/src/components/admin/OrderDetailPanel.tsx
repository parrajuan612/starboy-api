"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, Button, Field, TextAreaField } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { getAdminOrder, updateOrderStatus as changeOrderStatus } from "@/lib/admin";
import { formatCOP, formatDate } from "@/lib/format";
import { ORDER_BADGE, ORDER_STATUS_LABEL } from "@/lib/order-status";
import type { AdminOrder, UpdateOrderStatusResult } from "@/types";

type Next = "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

const ACTION_LABEL: Record<Next, string> = {
  PROCESSING: "Pasar a preparación",
  SHIPPED: "Marcar como enviada",
  DELIVERED: "Marcar como entregada",
  CANCELLED: "Cancelar orden",
};

const EFFECT: Record<string, string> = {
  RELEASED: "Se liberó el stock que estaba reservado.",
  RESTOCKED: "Las unidades volvieron al inventario.",
};

export function OrderDetailPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState<Next | null>(null);
  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<UpdateOrderStatusResult | null>(null);

  useEffect(() => {
    let alive = true;
    getAdminOrder(id)
      .then((o) => alive && setOrder(o))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : "No pudimos cargar la orden."));
    return () => {
      alive = false;
    };
  }, [id]);

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!order) {
    return (
      <p role="status" className="body text-ink-muted flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando…
      </p>
    );
  }

  const a = order.shipping_address;
  const next = order.allowed_next.filter((s): s is Next => s !== "PENDING_PAYMENT" && s !== "PAID");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || saving) return;
    if (target === "SHIPPED" && (!carrier.trim() || !tracking.trim())) {
      setActionError("Indica la transportadora y el número de guía para marcarla como enviada.");
      return;
    }
    if (target === "CANCELLED" && note.trim().length < 3) {
      setActionError("Cuéntanos el motivo de la cancelación (mínimo 3 caracteres).");
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      const res = await changeOrderStatus(id, {
        status: target,
        note: note.trim() || undefined,
        ...(target === "SHIPPED" ? { carrier: carrier.trim(), tracking_number: tracking.trim() } : {}),
      });
      setOrder(res.order);
      setResult(res);
      setTarget(null);
      setNote("");
      onChanged();
    } catch (err) {
      const detail = err instanceof ApiError ? Object.values(err.fieldErrors)[0] : undefined;
      setActionError(detail ?? (err instanceof ApiError ? err.message : "No pudimos cambiar el estado."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-7">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="display-sm">{order.code}</p>
          <span className={`sb-badge ${ORDER_BADGE[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span>
        </div>
        <p className="caption text-ink-muted">Creada el {formatDate(order.created_at)}</p>
      </header>

      {result && (
        <div role="status" className="border-success text-success body-sm flex items-start gap-2 border p-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          <div>
            <p>Estado actualizado a «{ORDER_STATUS_LABEL[result.order.status]}».</p>
            {result.stock_effect && <p>{EFFECT[result.stock_effect]}</p>}
            {result.refund_required && <p className="font-semibold">Esta orden ya estaba pagada: el reembolso hay que hacerlo manualmente.</p>}
          </div>
        </div>
      )}

      {/* Acciones */}
      <section aria-labelledby="od-actions">
        <h3 id="od-actions" className="label mb-3">Cambiar estado</h3>
        {next.length === 0 ? (
          <p className="body-sm text-ink-muted">
            {order.status === "PENDING_PAYMENT" ? "Esperando el pago. " : ""}No hay cambios de estado disponibles manualmente.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {next.map((s) => (
                <Button key={s} variant={s === "CANCELLED" ? "secondary" : "primary"} onClick={() => { setTarget(s); setActionError(null); setResult(null); }} aria-pressed={target === s}>
                  {ACTION_LABEL[s]}
                </Button>
              ))}
            </div>
            {target && (
              <form onSubmit={submit} noValidate className="border-line mt-4 space-y-4 border p-4">
                <p className="body-strong">{ACTION_LABEL[target]}</p>
                {target === "CANCELLED" && (
                  <p className="body-sm text-danger">
                    {order.status === "PENDING_PAYMENT" ? "Se liberará el stock reservado." : "Se devolverá el stock al inventario y habrá que reembolsar el pago manualmente."}
                  </p>
                )}
                {target === "SHIPPED" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Transportadora" name="carrier" required value={carrier} onChange={(e) => setCarrier(e.target.value)} maxLength={80} />
                    <Field label="Número de guía" name="tracking" required value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={120} />
                  </div>
                )}
                <TextAreaField label={target === "CANCELLED" ? "Motivo de la cancelación" : "Nota para el historial"} name="note" required={target === "CANCELLED"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
                {actionError && <Alert>{actionError}</Alert>}
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" loading={saving}>Confirmar</Button>
                  <Button variant="secondary" onClick={() => setTarget(null)} disabled={saving}>Volver</Button>
                </div>
              </form>
            )}
          </>
        )}
      </section>

      {/* Cliente y facturación */}
      <section aria-labelledby="od-customer">
        <h3 id="od-customer" className="label mb-3">Cliente y facturación</h3>
        <dl className="body-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-ink-muted">Nombre</dt><dd>{order.customer_name}</dd>
          <dt className="text-ink-muted">Correo</dt><dd className="break-all">{order.customer_email}</dd>
          <dt className="text-ink-muted">Celular</dt><dd>{order.customer_phone || "—"}</dd>
          <dt className="text-ink-muted">Cédula</dt><dd>{order.customer_document || "—"}</dd>
        </dl>
      </section>

      <section aria-labelledby="od-ship">
        <h3 id="od-ship" className="label mb-3">Envío</h3>
        <address className="body-sm space-y-0.5 not-italic">
          <p className="body-strong">{a.recipient_name} · {a.phone}</p>
          <p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
          <p>{a.city}, {a.department}</p>
          {a.notes && <p className="text-ink-muted">Notas: {a.notes}</p>}
        </address>
        {(order.carrier || order.tracking_number) && (
          <p className="body-sm mt-2">{order.carrier} {order.tracking_number && <>· guía <span className="body-strong">{order.tracking_number}</span></>}</p>
        )}
      </section>

      <section aria-labelledby="od-items">
        <h3 id="od-items" className="label mb-3">Prendas</h3>
        <ul className="divide-line border-line divide-y border-y">
          {order.items.map((i) => (
            <li key={i.variant_id} className="flex justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="body-sm body-strong">{i.product_name}</p>
                <p className="caption text-ink-muted">{i.sku} · Talla {i.size} · {i.quantity} × {formatCOP(i.unit_price_cop)}</p>
              </div>
              <p className="body-sm tabular-nums">{formatCOP(i.line_total_cop)}</p>
            </li>
          ))}
        </ul>
        <dl className="body-sm mt-3 space-y-1">
          <div className="flex justify-between"><dt className="text-ink-muted">Subtotal</dt><dd className="tabular-nums">{formatCOP(order.subtotal_cop)}</dd></div>
          {order.discount_cop > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Descuento</dt><dd className="tabular-nums">−{formatCOP(order.discount_cop)}</dd></div>}
          <div className="flex justify-between"><dt className="text-ink-muted">Envío</dt><dd className="tabular-nums">{order.shipping_cop === 0 ? "Gratis" : formatCOP(order.shipping_cop)}</dd></div>
          <div className="border-line flex justify-between border-t pt-2"><dt className="body-strong">Total</dt><dd className="body-strong tabular-nums">{formatCOP(order.total_cop)}</dd></div>
        </dl>
        {order.notes && <p className="body-sm text-ink-muted mt-3">Nota del cliente: {order.notes}</p>}
      </section>

      {order.history && order.history.length > 0 && (
        <section aria-labelledby="od-hist">
          <h3 id="od-hist" className="label mb-3">Historial</h3>
          <ol className="border-line ml-1.5 space-y-4 border-l pl-5">
            {[...order.history].reverse().map((h, i) => (
              <li key={h.created_at + h.status + i} className="relative">
                <span aria-hidden className={`absolute top-1.5 -left-[26px] size-2.5 rounded-full ${i === 0 ? "bg-brand" : "bg-line-strong"}`} />
                <p className="body-sm body-strong">{h.label}</p>
                {h.note && <p className="body-sm text-ink-muted">{h.note}</p>}
                <p className="caption text-ink-muted">{formatDate(h.created_at)} · {h.changed_by_name || "Sistema"}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
