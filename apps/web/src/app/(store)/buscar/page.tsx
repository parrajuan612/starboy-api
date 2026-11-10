import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { CatalogView } from "@/components/product/CatalogView";
import { parseFilters, type RawSearchParams } from "@/lib/catalog-query";
import { getMenuSource } from "@/lib/catalog-server";

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseFilters(await searchParams);
  return { title: q ? `Resultados para «${q}»` : "Buscar", robots: { index: false } };
}

export default async function SearchPage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  if (!filters.q) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
        <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Buscar" }]} />
        <h1 className="display-lg mt-4">Buscar</h1>
        <p className="body text-ink-muted mt-3">Escribe qué buscas en el buscador de arriba: una referencia, una marca o una prenda.</p>
      </div>
    );
  }
  const menu = await getMenuSource();
  return (
    <CatalogView
      title={`Resultados para «${filters.q}»`}
      path="/buscar"
      crumbs={[{ label: "Inicio", href: "/" }, { label: "Buscar" }]}
      scope={{}}
      filters={filters}
      brands={menu.brands}
      categoryNav={null}
    />
  );
}
