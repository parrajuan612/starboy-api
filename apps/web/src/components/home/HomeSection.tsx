import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { ProductCard } from "@/components/product/ProductCard";
import type { HomePublic } from "@/types";

type Section = HomePublic["sections"][number];

/** Fila de productos: en móvil se desliza de lado (con imán), desde tablet es una cuadrícula. */
export function HomeProductSection({ section, index }: { section: Section; index: number }) {
  const id = `home-sec-${index}`;
  return (
    <section aria-labelledby={id} className="mx-auto max-w-7xl px-4 pt-14 md:px-8 md:pt-20">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 id={id} className="display-md">
            {section.title}
          </h2>
          {section.subtitle && <p className="body text-ink-muted mt-2 max-w-xl">{section.subtitle}</p>}
        </div>
        {section.view_all_url.startsWith("/") && (
          <Link href={section.view_all_url} className="label text-ink hover:text-accent inline-flex min-h-11 shrink-0 items-center gap-2 underline-offset-4 hover:underline">
            Ver todo
            <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
          </Link>
        )}
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0">
        {section.products.map((p, i) => (
          <li key={p.id} className="w-[58vw] max-w-72 shrink-0 snap-start md:w-auto md:max-w-none">
            <ProductCard product={p} priority={index === 0 && i < 2} />
          </li>
        ))}
      </ul>
    </section>
  );
}
