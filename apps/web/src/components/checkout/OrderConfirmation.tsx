"use client";

import { AlertCircle, CheckCircle2, Clock, Loader2, PackageCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { Alert, Button } from "@/components/ui";
import { formatClock, useCountdown } from "@/hooks/useCountdown";
import { ApiError, isApiError } from "@/lib/api-client";
import { formatCOP, formatDate } from "@/lib/format";
import { createPayment, getOrder, paymentPath } from "@/lib/orders";
import type { Order } from "@/types";

const POLL_MS = 5000;
const PAID = new Set(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]);

/**
 * Pantalla de la orden tras pagar (o tras crearla). Muestra el estado real que tiene la API:
 *  pagada → éxito; pendiente → falta el pago (con cuenta regresiva y «Pagar ahora»); cancelada → motivo.
 * Mientras esté pendiente se consulta cada 5 s, para reflejar un pago confirmado desde otro lado.
 */
export function OrderConfirmation({ id, pago }: { id: string; pago?: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      getOrder(id)
        .then((o) => {
          if (!alive) return;
          setOrder(o);
          setError(null);
          if (o.status === "PENDING_PAYMENT") timer = setTimeout(load, POLL_MS);
        })
        .catch((e: unknown) => {
          if (!alive) return;
          if (isApiError(e) && e.status !== 0) setError(e);
          else timer = setTimeout(load, POLL_MS); // sin red: reintenta solo
        });
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, reload]);

  const pending = order?.status === "PENDING_PAYMENT";
  const left = useCountdown(pending ? order?.reserved_until : undefined);

  async function payNow() {
    if (!order || paying) return;
    setPaying(true);
    setPayError(null);
    try {
      const path = paymentPath(await createPayment(order.id));
      if (path) {
        router.push(path);
        return;
      }
      setPayError("No pudimos abrir la pasarela de pago. Inténtalo de nuevo en unos segundos.");
    } catch (e) {
      setPayError(isApiError(e) ? e.message : "No pudimos abrir la pasarela de pago. Inténtalo de nuevo.");
      setReload((n) => n + 1); // la orden pudo haber vencido o pagarse en otro lado: se vuelve a leer
    }
    setPaying(false);
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center md:px-8">
        <h1 className="display-md">{error.status === 404 ? "No encontramos esa orden" : "No pudimos cargar tu orden"}</h1>
        <p className="body text-ink-muted mt-3">{error.status === 404 ? "Revisa el enlace o entra a tu cuenta para ver tus pedidos." : error.message}</p>
        <Link href="/cuenta" className="sb-btn sb-btn--primary mt-6">
          Ir a mi cuenta
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div role="status" className="body text-ink-muted mx-auto flex max-w-xl items-center justify-center gap-2 px-4 py-24">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden />
        Cargando tu orden…
      </div>
    );
  }

  const paid = PAID.has(order.status);
  const cancelled = order.status === "CANCELLED";
  const expired = pending && left === 0;
  const a = order.shipping_address;
  const cancelNote = [...(order.history ?? [])].reverse().find((h) => h.status === "CANCELLED")?.note;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Mi cuenta", href: "/cuenta" }, { label: `Orden ${order.code}` }]} />

      <header className="mt-6 mb-8 space-y-3">
        {paid ? (
          <p className="text-success label flex items-center gap-2">
            <CheckCircle2 className="size-5" strokeWidth={1.5} aria-hidden />
            {pago === "aprobado" ? "Pago aprobado" : "Orden pagada"}
          </p>
        ) : cancelled ? (
          <p className="text-danger label flex items-center gap-2">
            <XCircle className="size-5" strokeWidth={1.5} aria-hidden />
            Orden cancelada
          </p>
        ) : (
          <p className="label flex items-center gap-2">
            <Clock className="size-5" strokeWidth={1.5} aria-hidden />
            Falta tu pago
          </p>
        )}
        <h1 className="display-lg">{paid ? "¡Gracias por tu compra!" : cancelled ? "Tu orden fue cancelada" : "Tu orden está reservada"}</h1>
        <p className="body text-ink-muted max-w-2xl">
          {paid
            ? "Recibimos tu pago y ya estamos alistando tu pedido. Guarda tu código para cualquier consulta."
            : cancelled
              ? (cancelNote ?? "Esta orden ya no está activa y liberamos los productos que tenía reservados.")
              : "Reservamos tus productos mientras completas el pago. Si el tiempo se acaba, la orden se cancela sola."}
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <p className="display-md" aria-label={`Código de la orden ${order.code}`}>
            {order.code}
          </p>
          <span className={`sb-badge ${paid ? "sb-badge--success" : cancelled ? "sb-badge--danger" : "sb-badge--brand-outline"}`}>{order.status_label}</span>
        </div>
      </header>

      {pending && (
        <section aria-label="Pago pendiente" className="bg-surface-raised border-line mb-8 border p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="body-strong">Total a pagar: {formatCOP(order.total_cop)}</p>
              {left !== null && (
                <p className={`body-sm flex items-center gap-1.5 ${expired || left < 300 ? "text-danger" : "text-ink-muted"}`}>
                  <AlertCircle className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                  {expired ? "Tu reserva venció: la orden se cancelará en breve." : `Tu reserva vence en ${formatClock(left)}.`}
                </p>
              )}
              {pago === "pendiente" && !expired && <p className="body-sm text-ink-muted">Todavía no registramos tu pago.</p>}
            </div>
            <Button onClick={payNow} loading={paying} disabled={expired} className="sm:w-auto">
              Pagar ahora
            </Button>
          </div>
          {payError && (
            <div className="mt-4">
              <Alert>{payError}</Alert>
            </div>
          )}
        </section>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div className="space-y-10">
          <section aria-labelledby="oc-items">
            <h2 id="oc-items" className="display-sm mb-2">
              Resumen del pedido
            </h2>
            <ul className="divide-line divide-y" aria-label="Productos">
              {order.items.map((it) => (
                <li key={it.variant_id} className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="body">{it.product_name}</p>
                    <p className="body-sm text-ink-muted">
                      Talla {it.size} · {it.quantity} × {formatCOP(it.unit_price_cop)}
                    </p>
                  </div>
                  <p className="body-strong shrink-0 tabular-nums">{formatCOP(it.line_total_cop)}</p>
                </li>
              ))}
            </ul>
            <dl className="body border-line space-y-2 border-t pt-4">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="tabular-nums">{formatCOP(order.subtotal_cop)}</dd>
              </div>
              {order.discount_cop > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Descuento</dt>
                  <dd className="tabular-nums">-{formatCOP(order.discount_cop)}</dd>
                </div>
              )}
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

          {order.history && order.history.length > 0 && (
            <section aria-labelledby="oc-history">
              <h2 id="oc-history" className="display-sm mb-4">
                Seguimiento
              </h2>
              <ol className="border-line ml-2 space-y-5 border-l pl-6">
                {[...order.history].reverse().map((h, i) => (
                  <li key={h.created_at + h.status} className="relative">
                    <span className={`absolute top-1.5 -left-[31px] size-2.5 rounded-full ${i === 0 ? "bg-brand" : "bg-line-strong"}`} aria-hidden />
                    <p className="body-strong">{h.label}</p>
                    {h.note && <p className="body-sm text-ink-muted">{h.note}</p>}
                    <p className="caption text-ink-muted">{formatDate(h.created_at)}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="mt-10 space-y-8 lg:mt-0">
          <section aria-labelledby="oc-ship" className="bg-surface-raised border-line border p-5">
            <h2 id="oc-ship" className="display-sm mb-3">
              Dirección de envío
            </h2>
            <address className="body space-y-0.5 not-italic">
              <p className="body-strong">{a.recipient_name}</p>
              <p>{a.line1}</p>
              {a.line2 && <p>{a.line2}</p>}
              <p>
                {a.city}, {a.department}
              </p>
              <p className="text-ink-muted">Tel. {a.phone}</p>
            </address>
            {a.notes && (
              <p className="body-sm text-ink-muted border-line mt-3 border-t pt-3">
                <span className="text-ink font-semibold">Notas: </span>
                {a.notes}
              </p>
            )}
            {order.carrier && (
              <p className="body-sm border-line mt-3 border-t pt-3">
                <span className="font-semibold">{order.carrier}</span>
                {order.tracking_number && <> · guía {order.tracking_number}</>}
              </p>
            )}
          </section>

          <div className="space-y-3">
            {paid && (
              <p className="body-sm text-ink-muted flex items-start gap-2">
                <PackageCheck className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                Orden hecha el {formatDate(order.created_at)} — cuando despachemos tu pedido, la guía de envío aparecerá aquí.
              </p>
            )}
            <Link href="/productos" className={`sb-btn w-full ${paid ? "sb-btn--primary" : "sb-btn--secondary"}`}>
              Seguir comprando
            </Link>
            <Link href="/cuenta" className="sb-btn sb-btn--secondary w-full">
              Ir a mi cuenta
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
