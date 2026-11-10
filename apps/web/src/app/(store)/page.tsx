import { ButtonLink } from "@/components/ui";

export default function HomePage() {
  return (
    <>
      <section className="theme-editorial bg-surface text-ink">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-28">
          <p className="label text-accent mb-4">Nueva temporada</p>
          <h1 className="display-xl max-w-3xl">New season</h1>
          <p className="body text-ink-muted mt-6 max-w-xl">
            Sneakers y streetwear para Colombia. Compra del catálogo local o encarga desde USA.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <ButtonLink href="/nuevos">Ver novedades</ButtonLink>
            <ButtonLink href="/encargos-usa" variant="secondary" className="border-sb-white text-sb-white">
              Encargos USA
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
