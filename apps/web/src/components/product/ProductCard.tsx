import Link from "next/link";

import type { ProductSummary } from "@/types";

import { Price } from "./Price";
import { ProductImage } from "./ProductImage";

const SIZES = "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 768px) 33vw, 50vw";

/**
 * Tarjeta del manual (§12.8): fondo surface-raised, sin radio ni sombra, borde `line` (hover: `line-strong`).
 * Imagen 1:1 sobre blanco con cambio a la segunda foto al pasar el mouse; badges siempre con texto.
 */
export function ProductCard({ product, priority = false }: { product: ProductSummary; priority?: boolean }) {
  const p = product;
  const alt = [p.brand?.name, p.name, p.colorway].filter(Boolean).join(" ");
  return (
    <article className="sb-product-card group relative flex flex-col">
      <div className="bg-sb-white relative aspect-square overflow-hidden">
        {p.image ? (
          <div className={`absolute inset-0 ${p.in_stock ? "" : "opacity-50"}`}>
            <ProductImage
              src={p.image.url}
              alt={p.image.alt || alt}
              sizes={SIZES}
              priority={priority}
              className={`transition-opacity duration-200 ${p.hover_image ? "group-hover:opacity-0" : ""}`}
            />
            {p.hover_image && (
              <ProductImage
                src={p.hover_image.url}
                alt=""
                sizes={SIZES}
                className="opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
            )}
          </div>
        ) : (
          <div className="text-ink-muted body-sm flex h-full items-center justify-center">Sin foto</div>
        )}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {p.discount_percent > 0 && <span className="sb-badge sb-badge--discount">-{p.discount_percent}%</span>}
          {p.is_new_release && <span className="sb-badge sb-badge--brand-outline bg-sb-white">Nuevo</span>}
          {!p.in_stock && <span className="sb-badge sb-badge--danger bg-sb-white">Agotado</span>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3 md:p-4">
        {p.brand && <p className="caption text-ink-muted uppercase tracking-wide">{p.brand.name}</p>}
        <h3 className="body">
          {/* El enlace cubre toda la tarjeta (área táctil completa) */}
          <Link href={`/producto/${p.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {p.name}
          </Link>
        </h3>
        {p.colorway && <p className="body-sm text-ink-muted">{p.colorway}</p>}
        <div className="mt-auto pt-2">
          <Price price={p.base_price_cop} compareAt={p.compare_at_price_cop} />
        </div>
      </div>
    </article>
  );
}
