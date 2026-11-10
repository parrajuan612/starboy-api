"use client";

import { AlertCircle, Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

import { ProductImage } from "@/components/product/ProductImage";
import { isBlocking, type LineCheck } from "@/hooks/useCartChecks";
import { formatCOP } from "@/lib/format";
import { MAX_PER_LINE, useCartStore, type CartLine } from "@/store/cart";

interface Props {
  line: CartLine;
  check?: LineCheck;
  /** Se llama al navegar desde la línea (el drawer se cierra). */
  onNavigate?: () => void;
}

/** Una prenda del carrito: foto, nombre, talla, precio, cantidad (1–10, sin pasar del stock) y eliminar. */
export function CartLineItem({ line, check, onNavigate }: Props) {
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);

  const blocked = isBlocking(check) && check?.status !== "over";
  const max = Math.min(MAX_PER_LINE, check?.available ?? MAX_PER_LINE);
  const href = `/producto/${line.productSlug}`;

  return (
    <li className={`flex gap-4 py-5 ${blocked ? "opacity-90" : ""}`}>
      <Link href={href} onClick={onNavigate} tabIndex={-1} aria-hidden className="bg-sb-white border-line relative block size-24 shrink-0 border sm:size-28">
        {line.imageUrl && <ProductImage src={line.imageUrl} alt="" sizes="112px" className={blocked ? "opacity-40" : ""} />}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="body">
              <Link href={href} onClick={onNavigate} className="hover:underline underline-offset-4">
                {line.name}
              </Link>
            </p>
            <p className="body-sm text-ink-muted">Talla {line.size}</p>
          </div>
          <p className={`body-strong shrink-0 tabular-nums ${blocked ? "text-ink-muted line-through" : ""}`}>{formatCOP(line.unitPriceCOP * line.quantity)}</p>
        </div>

        {check?.status === "gone" || check?.status === "soldout" ? (
          <p className="text-danger body-sm flex items-start gap-1.5" role="status">
            <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            {check.status === "gone" ? "Este producto ya no está disponible." : "Esta talla se agotó."} Elimínala para continuar.
          </p>
        ) : check?.status === "over" ? (
          <p className="text-danger body-sm flex flex-wrap items-center gap-x-2" role="status">
            <span className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              Solo quedan {check.available} {check.available === 1 ? "unidad" : "unidades"}.
            </span>
            <button type="button" onClick={() => setQuantity(line.variantId, check.available!)} className="text-ink underline underline-offset-4">
              Ajustar a {check.available}
            </button>
          </p>
        ) : check?.status === "low" ? (
          <p className="body-sm text-ink-muted" role="status">
            ¡Quedan solo {check.available}!
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          {!blocked ? (
            <div role="group" aria-label={`Cantidad de ${line.name}, talla ${line.size}`} className="border-line-strong inline-flex items-center border">
              <button
                type="button"
                aria-label="Quitar una unidad"
                disabled={line.quantity <= 1}
                onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                className="inline-flex size-11 items-center justify-center disabled:opacity-30"
              >
                <Minus className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
              <output aria-live="polite" className="body-strong w-10 text-center tabular-nums">
                {line.quantity}
              </output>
              <button
                type="button"
                aria-label="Agregar una unidad"
                disabled={line.quantity >= max}
                onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                className="inline-flex size-11 items-center justify-center disabled:opacity-30"
              >
                <Plus className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => remove(line.variantId)}
            aria-label={`Eliminar ${line.name}, talla ${line.size}`}
            className="body-sm text-ink-muted hover:text-ink inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:underline"
          >
            <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
            Eliminar
          </button>
        </div>
        {!blocked && line.quantity >= max && max < MAX_PER_LINE && <p className="caption text-ink-muted">Es todo lo que hay disponible.</p>}
        {!blocked && line.quantity >= MAX_PER_LINE && <p className="caption text-ink-muted">Máximo {MAX_PER_LINE} por producto.</p>}
      </div>
    </li>
  );
}
