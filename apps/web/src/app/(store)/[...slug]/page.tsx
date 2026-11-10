import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui";
import { PLANNED_SECTIONS } from "@/lib/site";

type Params = { slug: string[] };

/** Rutas de la tienda que aún no tienen pantalla: «Próximamente» en vez de un 404. Cada página real, al crearse, tiene prioridad sobre esta. */
const NAMES: Record<string, string> = {
  hombre: "Hombre", mujer: "Mujer", accesorios: "Accesorios", marcas: "Marcas", nuevos: "Nuevos lanzamientos",
  promociones: "Promociones", "encargos-usa": "Encargos USA", contacto: "Contacto", nosotros: "Nosotros",
  politicas: "Políticas", ayuda: "Ayuda", buscar: "Resultados de búsqueda", rastreo: "Rastrear mi pedido",
  carrito: "Carrito", checkout: "Checkout",
};

const titleOf = (slug: string[]) => {
  const last = slug[slug.length - 1];
  return NAMES[last] ?? NAMES[slug[0]] ?? last.replace(/-/g, " ");
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  if (!PLANNED_SECTIONS.has(slug[0])) return {};
  return { title: titleOf(slug), robots: { index: false } };
}

export default async function ComingSoonPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  if (!PLANNED_SECTIONS.has(slug[0])) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-20 md:px-8">
      <p className="label text-ink-muted mb-3">Próximamente</p>
      <h1 className="display-lg capitalize">{titleOf(slug)}</h1>
      <p className="body text-ink-muted mt-4 max-w-xl">Estamos armando esta sección. Mientras tanto, sigue explorando la tienda.</p>
      <div className="mt-8">
        <ButtonLink href="/">Volver al inicio</ButtonLink>
      </div>
    </div>
  );
}
