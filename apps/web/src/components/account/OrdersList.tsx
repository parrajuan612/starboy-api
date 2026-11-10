"use client";

import { Loader2, PackageSearch } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { OrderTimeline } from "@/components/account/OrderTimeline";
import { Alert, Button, ButtonLink } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { formatCOP, formatDate } from "@/lib/format";
import { ORDER_BADGE, ORDER_STATUS_LABEL } from "@/lib/order-status";
import { confirmationPath } from "@/lib/orders";
import { listMyOrders } from "@/lib/account";
import type { Order } from "@/types";

/** «Camiseta M × 2, Jordan 1 42 y 1 prenda más» — resumen corto de lo que trae el pedido. */
export function itemsSummary(order: Order, max = 2): string {
  const parts = order.items.slice(0, max).map((i) => `${i.product_name} (${i.size}) × ${i.quantity}`);
  const rest = order.items.length - max;
  return rest > 0 ? `${parts.join(", ")} y ${rest} más` : parts.join(", ");
}

export function OrdersList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMyOrders(p);
      setOrders((prev) => (p === 1 ? res.data : [...prev, ...res.data.filter((o) => !prev.some((x) => x.id === o.id))]));
      setPage(p);
      setTotalPages(res.meta.total_pages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No pudimos cargar tus pedidos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos remotos
    void loadPage(1);
  }, [loadPage]);

  if (loading && orders.length === 0) {
    return (
      <p role="status" className="body text-ink-muted flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando tus pedidos…
      </p>
    );
  }

  if (error && orders.length === 0) {
    return (
      <div className="max-w-xl space-y-4">
        <Alert>{error}</Alert>
        <Button variant="secondary" onClick={() => loadPage(1)}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="border-line border border-dashed p-10 text-center">
        <PackageSearch className="text-ink-muted mx-auto size-10" strokeWidth={1.5} aria-hidden />
        <h2 className="display-sm mt-3">Aún no tienes pedidos</h2>
        <p className="body text-ink-muted mt-1">Cuando compres, los verás aquí con su seguimiento.</p>
        <ButtonLink href="/productos" className="mt-6">
          Ver productos
        </ButtonLink>
      </div>
    );
  }

  return (
    <section aria-labelledby="orders-title" className="space-y-5">
      <h2 id="orders-title" className="display-sm">
        Mis pedidos
      </h2>
      <ul aria-label="Lista de pedidos" className="space-y-4">
        {orders.map((o) => (
          <li key={o.id} className="bg-surface-raised border-line border p-5">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div>
                <p className="body-strong">
                  <Link href={`/cuenta/pedidos/${o.id}`} className="hover:text-accent underline-offset-4 hover:underline">
                    {o.code}
                  </Link>
                </p>
                <p className="caption text-ink-muted">{formatDate(o.created_at)}</p>
              </div>
              <span className={`sb-badge ${ORDER_BADGE[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
            </div>

            <div className="my-4">
              <OrderTimeline status={o.status} variant="compact" />
              <p className="caption text-ink-muted mt-2">Estado actual: {o.status_label}</p>
            </div>

            <p className="body-sm text-ink-muted">{itemsSummary(o)}</p>

            <div className="border-line mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="body">
                {o.item_count} {o.item_count === 1 ? "prenda" : "prendas"} · <span className="body-strong tabular-nums">{formatCOP(o.total_cop)}</span>
              </p>
              <div className="flex flex-wrap gap-3">
                {o.status === "PENDING_PAYMENT" && (
                  <ButtonLink href={confirmationPath(o.id)} variant="primary">
                    Pagar ahora
                  </ButtonLink>
                )}
                <ButtonLink href={`/cuenta/pedidos/${o.id}`} variant="secondary">
                  Ver seguimiento
                </ButtonLink>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {error && <Alert>{error}</Alert>}
      {page < totalPages && (
        <div className="text-center">
          <Button variant="secondary" loading={loading} onClick={() => loadPage(page + 1)}>
            Ver más pedidos
          </Button>
        </div>
      )}
    </section>
  );
}
