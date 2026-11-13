import { HomeProductSection } from "@/components/home/HomeSection";
import { HomeHeroBlock } from "@/components/home/HomeHero";
import { HomeBanners, HomeCategories } from "@/components/home/HomeTiles";
import { ButtonLink } from "@/components/ui";
import { getHome } from "@/lib/catalog-server";

// La portada se regenera cada minuto: un cambio del panel se ve en ≤ 1 min (el menú y el aviso, en ≤ 5).
export const revalidate = 60;

export default async function HomePage() {
  const home = await getHome();
  // Sin respuesta de la API: portada básica en vez de página rota.
  if (!home) {
    return (
      <section className="theme-editorial bg-surface text-ink">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-28">
          <h1 className="display-xl max-w-3xl">Starboy</h1>
          <p className="body text-ink-muted mt-6 max-w-xl">Sneakers y streetwear para Colombia. Compra del catálogo local o encarga desde USA.</p>
          <div className="mt-10">
            <ButtonLink href="/encargos-usa">Encargos USA</ButtonLink>
          </div>
        </div>
      </section>
    );
  }
  return (
    <>
      {home.hero && <HomeHeroBlock hero={home.hero} />}
      {home.banners.length > 0 && <HomeBanners banners={home.banners} />}
      {home.sections.map((s, i) => (
        <HomeProductSection key={i} section={s} index={i} />
      ))}
      {home.categories && <HomeCategories title={home.categories.title} items={home.categories.items} />}
      <div className="pb-16 md:pb-24" />
    </>
  );
}
