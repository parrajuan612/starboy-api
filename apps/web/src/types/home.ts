import type { ProductSummary } from "./catalog";

export type SectionKind = "NEW_RELEASES" | "FEATURED" | "ON_SALE" | "PICKED";

export interface HomeTile {
  image_url: string;
  title: string;
  subtitle: string;
  label: string;
  url: string;
}

export interface HomeHero {
  enabled: boolean;
  eyebrow: string;
  title: string;
  subtitle: string;
  image_url: string;
  primary_label: string;
  primary_url: string;
  secondary_label: string;
  secondary_url: string;
}

export interface HomeSection {
  kind: SectionKind;
  enabled: boolean;
  title: string;
  subtitle: string;
  limit: number;
  product_slugs: string[];
  view_all_url: string;
}

/** Documento editable de la portada (lo que guarda el panel). */
export interface HomeContent {
  announcement: { enabled: boolean; text: string; url: string };
  hero: HomeHero;
  banners: HomeTile[];
  sections: HomeSection[];
  categories: { enabled: boolean; title: string; items: HomeTile[] };
}

/** Lo que pinta la tienda: solo lo activo y con los productos ya resueltos. */
export interface HomePublic {
  announcement: { text: string; url: string } | null;
  hero: HomeHero | null;
  banners: HomeTile[];
  sections: { kind: SectionKind; title: string; subtitle: string; view_all_url: string; products: ProductSummary[] }[];
  categories: { title: string; items: HomeTile[] } | null;
}
