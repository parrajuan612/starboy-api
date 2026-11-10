"use client";

import { useEffect, useMemo, useState } from "react";

import { http, isApiError } from "@/lib/api-client";
import { useCartStore, type CartLine } from "@/store/cart";
import type { ProductDetail } from "@/types";

/**
 * Estado de cada línea frente al catálogo real:
 *  ok       – sin novedades (o aún no se ha podido consultar)
 *  low      – quedan pocas unidades
 *  over     – pidió más de lo que hay: hay que ajustar la cantidad
 *  soldout  – la talla se agotó
 *  gone     – el producto ya no se vende
 */
export type LineStatus = "ok" | "low" | "over" | "soldout" | "gone";

export interface LineCheck {
  status: LineStatus;
  /** Unidades vendibles ahora (si se pudo consultar). */
  available?: number;
}

export const isBlocking = (c?: LineCheck) => c?.status === "over" || c?.status === "soldout" || c?.status === "gone";
const LOW_STOCK = 3;

type Fetched = ProductDetail | "gone";

/**
 * Consulta la API por cada producto del carrito (precio y stock vigentes) mientras `active` sea true:
 * al abrir el drawer / la página, al cambiar los productos y al volver a la pestaña.
 * Si el precio cambió, lo actualiza en el store. Si la API no responde, no inventa nada: las líneas quedan «ok».
 */
export function useCartChecks(active: boolean): Record<string, LineCheck> {
  const lines = useCartStore((s) => s.lines);
  const [fetched, setFetched] = useState<Record<string, Fetched>>({});
  const slugsKey = useMemo(() => [...new Set(lines.map((l) => l.productSlug))].sort().join(","), [lines]);

  useEffect(() => {
    if (!active || !slugsKey) return;
    let alive = true;
    const slugs = slugsKey.split(",");

    const load = () => {
      for (const slug of slugs) {
        http
          .get<ProductDetail>(`/products/${encodeURIComponent(slug)}`)
          .then((p) => {
            if (!alive) return;
            setFetched((prev) => ({ ...prev, [slug]: p }));
            const prices: Record<string, number> = {};
            for (const v of p.variants) prices[v.id] = v.price_cop;
            useCartStore.getState().syncPrices(prices);
          })
          .catch((e: unknown) => {
            if (alive && isApiError(e) && e.status === 404) setFetched((prev) => ({ ...prev, [slug]: "gone" }));
          });
      }
    };

    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, slugsKey]);

  return useMemo(() => {
    const out: Record<string, LineCheck> = {};
    for (const l of lines) out[l.variantId] = check(l, fetched[l.productSlug]);
    return out;
  }, [lines, fetched]);
}

function check(line: CartLine, data?: Fetched): LineCheck {
  if (!data) return { status: "ok" };
  if (data === "gone") return { status: "gone" };
  const v = data.variants.find((x) => x.id === line.variantId);
  if (!v) return { status: "gone" };
  if (v.available <= 0) return { status: "soldout", available: 0 };
  if (line.quantity > v.available) return { status: "over", available: v.available };
  if (v.available <= LOW_STOCK) return { status: "low", available: v.available };
  return { status: "ok", available: v.available };
}
