import { ArrowRight } from "lucide-react";
import Image from "next/image";

import type { HomeTile } from "@/types";

import { SmartLink } from "./SmartLink";

/** Tarjeta con foto a sangre y texto sobre un degradado. */
function TileCard({ tile, ratio, sizes }: { tile: HomeTile; ratio: string; sizes: string }) {
  const name = [tile.title, tile.subtitle].filter(Boolean).join(". ");
  return (
    <SmartLink href={tile.url} ariaLabel={tile.label ? undefined : name || undefined} className={`group bg-sb-navy-deep relative block overflow-hidden text-white ${ratio}`}>
      <Image src={tile.image_url} alt="" fill sizes={sizes} unoptimized className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
        {tile.title && <p className="display-sm text-balance">{tile.title}</p>}
        {tile.subtitle && <p className="body-sm mt-1 text-white/85">{tile.subtitle}</p>}
        {tile.url && tile.label && (
          <span className="label mt-3 inline-flex items-center gap-2 underline-offset-4 group-hover:underline">
            {tile.label}
            <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
          </span>
        )}
      </div>
    </SmartLink>
  );
}

/** Banners promocionales: 1, 2 o 3 según los que se hayan cargado. */
export function HomeBanners({ banners }: { banners: HomeTile[] }) {
  const cols = banners.length >= 3 ? "md:grid-cols-3" : banners.length === 2 ? "md:grid-cols-2" : "";
  const sizes = banners.length === 1 ? "100vw" : "(min-width: 768px) 50vw, 100vw";
  return (
    <section aria-label="Promociones" className="mx-auto max-w-7xl px-4 pt-10 md:px-8 md:pt-14">
      <ul className={`grid gap-3 md:gap-4 ${cols}`}>
        {banners.map((b, i) => (
          <li key={i}>
            <TileCard tile={b} sizes={sizes} ratio={banners.length === 1 ? "aspect-[4/5] md:aspect-[21/8]" : "aspect-[4/5] md:aspect-[4/5] lg:aspect-[5/6]"} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Categorías destacadas con foto. */
export function HomeCategories({ title, items }: { title: string; items: HomeTile[] }) {
  return (
    <section aria-labelledby="home-cats" className="mx-auto max-w-7xl px-4 pt-14 md:px-8 md:pt-20">
      {title && (
        <h2 id="home-cats" className="display-md mb-6">
          {title}
        </h2>
      )}
      <ul className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {items.map((t, i) => (
          <li key={i}>
            <TileCard tile={{ ...t, subtitle: "", label: "" }} sizes="(min-width: 1280px) 16vw, (min-width: 1024px) 33vw, 50vw" ratio="aspect-[4/5]" />
          </li>
        ))}
      </ul>
    </section>
  );
}
