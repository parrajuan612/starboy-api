"use client";

import { Loader2, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { OrderTimeline } from "@/components/account/OrderTimeline";
import { Alert, ButtonLink } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { formatCOP, formatDate } from "@/lib/format";
import { ORDER_BADGE, ORDER_STATUS_LABEL } from "@/lib/order-status";
import { confirmationPath, getOrder } from "@/lib/orders";
import type { Order } from "@/types";

/** Seguimiento de un pedido: línea de tiempo, guía de envío, prendas, dirección y totales. */
export function OrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let alive = true;
    getOrder(id)
      .then((o) => alive && setOrder(o))
      .catch((e) => alive && setError(e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "No pudimos cargar el pedido.")));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="max-w-xl space-y-4">
        <Alert>{error.status === 404 ? "No encontramos ese pedido en tu cuenta." : error.message}</Alert>
        <ButtonLink href="/cuenta/pedidos" variant="secondary">
          Volver a mis pedidos
        </ButtonLink>
      </div>
    );
  }
  if (!order) {
    return (
      <p role="status" className="body text-ink-muted flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando el pedido…
      </p>
    );
  }

  const a = order.shipping_address;
  const cancelNote = [...(order.history ?? [])].reverse().find((h) => h.status === "CANCELLED")?.note;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/cuenta/pedidos" className="body-sm text-ink-muted hover:text-ink underline-offset-4 hover:underline">
          ← Mis pedidos
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="display-sm">Pedido {order.code}</h2>
          <span className={`sb-badge ${ORDER_BADGE[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span>
        </div>
        <p className="caption text-ink-muted">Hecho el {formatDate(order.created_at)}</p>
      </div>

      <section aria-labelledby="od-track" className="bg-surface-raised border-line border p-5">
        <h3 id="od-track" className="label mb-4">
          Seguimiento
        </h3>
        <OrderTimeline status={order.status} history={order.history} />
        {order.status === "CANCELLED" && cancelNote && <p className="body-sm text-ink-muted mt-3">{cancelNote}</p>}
        {order.status === "PENDING_PAYMENT" && (
          <div className="mt-4">
            <ButtonLink href={confirmationPath(order.id)}>Pagar ahora</ButtonLink>
          </div>
        )}
        {(order.carrier || order.tracking_number) && (
          <p className="body border-line mt-5 flex items-start gap-2 border-t pt-4">
            <Truck className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span>
              {order.carrier && <span className="body-strong">{order.carrier}</span>}
              {order.tracking_number && <> · guía <span className="body-strong">{order.tracking_number}</span></>}
            </span>
          </p>
        )}
        {!order.tracking_number && (order.status === "PAID" || order.status === "PROCESSING") && (
          <p className="body-sm text-ink-muted border-line mt-5 border-t pt-4">Cuando despachemos tu pedido, la guía de envío aparecerá aquí.</p>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="od-items">
          <h3 id="od-items" className="label mb-3">
            Prendas ({order.item_count})
          </h3>
          <ul className="divide-line border-line divide-y border-y">
            {order.items.map((i) => (
              <li key={i.variant_id} className="flex justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="body-strong">{i.product_name}</p>
                  <p className="body-sm text-ink-muted">
                    Talla {i.size} · {i.quantity} × {formatCOP(i.unit_price_cop)}
                  </p>
                </div>
                <p className="body tabular-nums">{formatCOP(i.line_total_cop)}</p>
              </li>
            ))}
          </ul>
          <dl className="body mt-4 space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="tabular-nums">{formatCOP(order.subtotal_cop)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Envío</dt>
              <dd className="tabular-nums">{order.shipping_cop === 0 ? "Gratis" : formatCOP(order.shipping_cop)}</dd>
            </div>
            <div className="border-line flex items-baseline justify-between gap-4 border-t pt-3">
              <dt className="body-strong">Total</dt>
              <dd className="price-lg tabular-nums">{formatCOP(order.total_cop)}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="od-ship" className="bg-surface-raised border-line h-fit border p-5">
          <h3 id="od-ship" className="label mb-3">
            Dirección de envío
          </h3>
          <address className="body space-y-0.5 not-italic">
            <p className="body-strong">{a.recipient_name}</p>
            <p>{a.line1}</p>
            {a.line2 && <p>{a.line2}</p>}
            <p>
              {a.city}, {a.department}
            </p>
            <p className="text-ink-muted">Tel. {a.phone}</p>
          </address>
          {a.notes && <p className="body-sm text-ink-muted border-line mt-3 border-t pt-3">{a.notes}</p>}
        </section>
      </div>
    </div>
  );
}
