import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CatalogView } from "@/components/product/CatalogView";
import { parseFilters, type RawSearchParams } from "@/lib/catalog-query";
import { getMenuSource } from "@/lib/catalog-server";

type Props = { params: Promise<{ brand: string }>; searchParams: Promise<RawSearchParams> };

async function find(slug: string) {
  const menu = await getMenuSource();
  return { menu, brand: menu.brands.find((b) => b.slug === slug.toLowerCase()) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brand } = await find((await params).brand);
  return brand ? { title: brand.name, alternates: { canonical: `/marcas/${brand.slug}` } } : {};
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { menu, brand } = await find((await params).brand);
  if (!brand) notFound();
  const filters = { ...parseFilters(await searchParams), marca: undefined };
  return (
    <CatalogView
      title={brand.name}
      path={`/marcas/${brand.slug}`}
      crumbs={[{ label: "Inicio", href: "/" }, { label: "Marcas", href: "/marcas" }, { label: brand.name }]}
      scope={{ brand: brand.slug }}
      filters={filters}
      brands={menu.brands}
      categoryNav={null}
      showBrandFilter={false}
    />
  );
}
