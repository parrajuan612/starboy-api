import type { Metadata } from "next";

import { CatalogRoute, catalogMetadata } from "@/components/product/CatalogRoute";
import type { RawSearchParams } from "@/lib/catalog-query";

type Props = { params: Promise<{ category?: string[] }>; searchParams: Promise<RawSearchParams> };

const section = {
  base: "/productos",
  title: "Todos los productos",
  intro: "Todo el catálogo de Starboy.",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return catalogMetadata({ ...section, segments: (await params).category ?? [], searchParams: {} });
}

export default async function Page({ params, searchParams }: Props) {
  return CatalogRoute({ ...section, segments: (await params).category ?? [], searchParams: await searchParams });
}
