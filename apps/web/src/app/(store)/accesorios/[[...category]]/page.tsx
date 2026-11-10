import type { Metadata } from "next";

import { CatalogRoute, catalogMetadata } from "@/components/product/CatalogRoute";
import type { RawSearchParams } from "@/lib/catalog-query";

type Props = { params: Promise<{ category?: string[] }>; searchParams: Promise<RawSearchParams> };

const section = {
  base: "/accesorios",
  title: "Accesorios",
  intro: "Gorras, medias, bolsos y más para completar tu outfit.",
  rootCategory: "accesorios",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return catalogMetadata({ ...section, segments: (await params).category ?? [], searchParams: {} });
}

export default async function Page({ params, searchParams }: Props) {
  return CatalogRoute({ ...section, segments: (await params).category ?? [], searchParams: await searchParams });
}
