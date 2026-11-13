import Image from "next/image";

import { ButtonLink } from "@/components/ui";
import type { HomeHero } from "@/types";

/** Banner principal. Con foto: a todo el ancho, con degradado para que el texto siempre se lea. Sin foto: fondo de marca. */
export function HomeHeroBlock({ hero }: { hero: HomeHero }) {
  const hasImage = !!hero.image_url;
  return (
    <section aria-labelledby="home-hero" className="theme-editorial bg-surface text-ink relative isolate overflow-hidden">
      {hasImage && (
        <>
          <Image src={hero.image_url} alt="" fill priority sizes="100vw" unoptimized className="-z-20 object-cover" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/40 to-black/10 md:bg-gradient-to-r md:from-black/75 md:via-black/35 md:to-transparent" />
        </>
      )}
      <div className={`mx-auto flex max-w-7xl flex-col justify-end px-4 py-16 md:justify-center md:px-8 ${hasImage ? "min-h-[72dvh] text-white md:min-h-[78dvh]" : "py-20 md:py-28"}`}>
        {hero.eyebrow && <p className={`label mb-4 ${hasImage ? "text-white/80" : "text-accent"}`}>{hero.eyebrow}</p>}
        <h1 id="home-hero" className="display-xl max-w-3xl text-balance">
          {hero.title}
        </h1>
        {hero.subtitle && <p className={`body mt-6 max-w-xl ${hasImage ? "text-white/85" : "text-ink-muted"}`}>{hero.subtitle}</p>}
        {(hero.primary_label || hero.secondary_label) && (
          <div className="mt-10 flex flex-wrap gap-4">
            {hero.primary_label && <ButtonLink href={hero.primary_url}>{hero.primary_label}</ButtonLink>}
            {hero.secondary_label && (
              <ButtonLink href={hero.secondary_url} variant="secondary" className="border-sb-white text-sb-white">
                {hero.secondary_label}
              </ButtonLink>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
