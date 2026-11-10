"use client";

import { AlertCircle, CheckCircle2, Minus, Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import { http } from "@/lib/api-client";
import { MAX_PER_LINE, useCartStore } from "@/store/cart";
import type { ProductDetail, Variant } from "@/types";

import { Price } from "./Price";

interface Props {
  slug: string;
  name: string;
  basePrice: number;
  compareAt: number;
  imageUrl?: string;
  initialVariants: Variant[];
}

const LOW_STOCK = 3;
const SYSTEM_LABEL = { EU: "Talla (EU)", US: "Talla (US)", ALPHA: "Talla", ONE: "Talla" } as const;

/**
 * Compra: selector de tallas con disponibilidad en vivo, cantidad y AGREGAR AL CARRITO.
 * El servidor entrega las tallas ya renderizadas; aquí se vuelven a pedir al abrir la ficha y al volver a la pestaña,
 * porque el stock cambia mientras la gente compra (la API descuenta lo reservado).
 */
export function ProductPurchase({ slug, name, basePrice, compareAt, imageUrl, initialVariants }: Props) {
  const [variants, setVariants] = useState(initialVariants);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const sizeGroup = useRef<HTMLDivElement>(null);

  const add = useCartStore((s) => s.add);
  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const inCart = useCartStore((s) => s.lines.find((l) => l.variantId === selectedId)?.quantity ?? 0);

  // Último id elegido, para que el refresco asíncrono vea la elección actual sin reiniciar el efecto.
  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      http
        .get<ProductDetail>(`/products/${encodeURIComponent(slug)}`)
        .then((fresh) => {
          if (!alive) return;
          setVariants(fresh.variants);
          const id = selectedRef.current;
          const v = id ? fresh.variants.find((x) => x.id === id) : undefined;
          if (id && (!v || !v.in_stock)) {
            setSelectedId(null);
            setMsg({ kind: "info", text: "Esa talla se acaba de agotar. Elige otra." });
          }
        })
        .catch(() => {
          /* sin conexión: se conserva lo que ya se mostraba */
        });
    };
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug]);

  const anyStock = variants.some((v) => v.in_stock);
  // Tope: 10 por línea (regla de la API) y lo que realmente hay, descontando lo que ya está en el carrito.
  const maxAdd = selected ? Math.max(Math.min(MAX_PER_LINE, selected.available) - inCart, 0) : MAX_PER_LINE;
  const shownQty = Math.min(qty, Math.max(maxAdd, 1));

  const price = selected?.price_cop ?? basePrice;
  const compare = price === basePrice ? compareAt : 0; // la promoción aplica al precio base, no a variantes con precio propio

  function onAdd() {
    if (!selected) {
      setMsg({ kind: "error", text: "Elige tu talla para continuar." });
      sizeGroup.current?.querySelector<HTMLElement>("button:not([aria-disabled='true'])")?.focus();
      return;
    }
    if (maxAdd <= 0) {
      setMsg({
        kind: "error",
        text: inCart >= MAX_PER_LINE ? `Ya tienes ${inCart} en tu carrito: el máximo por producto es ${MAX_PER_LINE}.` : `Ya tienes en tu carrito todas las unidades disponibles de esta talla (${inCart}).`,
      });
      return;
    }
    add(
      { variantId: selected.id, productSlug: slug, name, size: selected.size, sku: selected.sku, unitPriceCOP: selected.price_cop, imageUrl },
      shownQty,
    );
    setMsg({ kind: "ok", text: `Agregaste ${shownQty} ${shownQty === 1 ? "unidad" : "unidades"} (talla ${selected.size}) a tu carrito.` });
    setQty(1);
  }

  return (
    <div className="space-y-6">
      <Price price={price} compareAt={compare} size="pdp" />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p id="size-label" className="label">
            {SYSTEM_LABEL[variants[0]?.size_system ?? "EU"]}
          </p>
          <Link href="/ayuda/guia-de-tallas" className="body-sm text-ink-muted hover:text-ink underline underline-offset-4">
            Guía de tallas
          </Link>
        </div>
        <div ref={sizeGroup} role="group" aria-labelledby="size-label" className="sb-size-selector flex flex-wrap gap-2">
          {variants.map((v) => {
            const soldOut = !v.in_stock;
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={v.id === selectedId}
                aria-disabled={soldOut || undefined}
                aria-label={soldOut ? `Talla ${v.size}, agotada` : `Talla ${v.size}`}
                onClick={() => {
                  if (soldOut) return;
                  setSelectedId(v.id);
                  setQty(1);
                  setMsg(null);
                }}
                className="body px-3"
              >
                {v.size}
              </button>
            );
          })}
        </div>

        <div className="body-sm mt-3 min-h-5" aria-live="polite">
          {!anyStock ? (
            <p className="text-danger flex items-center gap-1.5">
              <AlertCircle className="size-4" strokeWidth={1.5} aria-hidden />
              Agotado por ahora
            </p>
          ) : selected && selected.available <= LOW_STOCK ? (
            <p className="text-danger flex items-center gap-1.5">
              <AlertCircle className="size-4" strokeWidth={1.5} aria-hidden />
              {selected.available === 1 ? "¡Última unidad!" : `¡Últimas ${selected.available} unidades!`}
            </p>
          ) : selected ? (
            <p className="text-success flex items-center gap-1.5">
              <CheckCircle2 className="size-4" strokeWidth={1.5} aria-hidden />
              En stock
            </p>
          ) : null}
        </div>
      </div>

      {anyStock && (
        <div>
          <p id="qty-label" className="label mb-2">
            Cantidad
          </p>
          <div role="group" aria-labelledby="qty-label" className="inline-flex items-center border border-line-strong">
            <button type="button" aria-label="Quitar una unidad" disabled={shownQty <= 1} onClick={() => setQty(shownQty - 1)} className="inline-flex size-11 items-center justify-center disabled:opacity-30">
              <Minus className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
            <output aria-live="polite" className="body-strong w-12 text-center tabular-nums">
              {shownQty}
            </output>
            <button type="button" aria-label="Agregar una unidad" disabled={shownQty >= maxAdd} onClick={() => setQty(shownQty + 1)} className="inline-flex size-11 items-center justify-center disabled:opacity-30">
              <Plus className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          <p className="caption text-ink-muted mt-2">Máximo {MAX_PER_LINE} por producto.</p>
        </div>
      )}

      <div className="space-y-3">
        <Button onClick={onAdd} disabled={!anyStock} className="w-full">
          <ShoppingBag className="size-4" strokeWidth={1.5} aria-hidden />
          {anyStock ? "Agregar al carrito" : "Agotado"}
        </Button>

        <div aria-live="polite" className="min-h-6">
          {msg && (
            <p className={`body-sm flex items-start gap-1.5 ${msg.kind === "ok" ? "text-success" : msg.kind === "error" ? "text-danger" : "text-ink"}`}>
              {msg.kind === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden /> : <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
              <span>
                {msg.text}{" "}
                {msg.kind === "ok" && (
                  <Link href="/carrito" className="text-ink underline underline-offset-4">
                    Ver carrito
                  </Link>
                )}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
