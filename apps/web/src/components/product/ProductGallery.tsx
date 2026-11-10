"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";

import type { ProductImage as Img } from "@/types";

import { ProductImage } from "./ProductImage";

/**
 * Galería (§12.8): imagen principal 1:1 + miniaturas (la activa con borde `ink`). Las fotos ya llegan
 * ordenadas por posición. El carrusel usa scroll-snap, así que en móvil se desliza con el dedo.
 */
export function ProductGallery({ images, name }: { images: Img[]; name: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = images.length;

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
    setActive(i);
  };

  if (count === 0) {
    return <div className="bg-sb-white text-ink-muted body-sm flex aspect-square items-center justify-center">Sin fotos</div>;
  }

  return (
    <div className="space-y-3" aria-roledescription="carrusel" aria-label={`Fotos de ${name}`}>
      <div className="bg-sb-white relative">
        <div
          ref={track}
          onScroll={(e) => {
            const el = e.currentTarget;
            setActive(Math.round(el.scrollLeft / el.clientWidth));
          }}
          className="sb-gallery-track flex snap-x snap-mandatory overflow-x-auto"
        >
          {images.map((im, i) => (
            <div
              key={im.id}
              role="group"
              aria-roledescription="foto"
              aria-label={`${i + 1} de ${count}`}
              className="relative aspect-square w-full shrink-0 snap-center"
            >
              <ProductImage src={im.url} alt={im.alt || `${name}, foto ${i + 1}`} sizes="(min-width: 1024px) 50vw, 100vw" priority={i === 0} />
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(Math.max(active - 1, 0))}
              disabled={active === 0}
              aria-label="Foto anterior"
              className="bg-sb-white/90 border-line absolute top-1/2 left-2 hidden size-11 -translate-y-1/2 items-center justify-center border disabled:opacity-30 md:inline-flex"
            >
              <ChevronLeft className="size-5" strokeWidth={1.5} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(Math.min(active + 1, count - 1))}
              disabled={active === count - 1}
              aria-label="Foto siguiente"
              className="bg-sb-white/90 border-line absolute top-1/2 right-2 hidden size-11 -translate-y-1/2 items-center justify-center border disabled:opacity-30 md:inline-flex"
            >
              <ChevronRight className="size-5" strokeWidth={1.5} aria-hidden />
            </button>
            <p className="caption bg-sb-ink/70 text-sb-white absolute right-2 bottom-2 px-2 py-1 md:hidden" aria-hidden>
              {active + 1} / {count}
            </p>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5" aria-label="Miniaturas">
          {images.map((im, i) => (
            <li key={im.id}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === active ? "true" : undefined}
                className={`bg-sb-white relative block aspect-square w-full border-2 ${i === active ? "border-ink" : "border-line hover:border-line-strong"}`}
              >
                <ProductImage src={im.url} alt="" sizes="120px" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
