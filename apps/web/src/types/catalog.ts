/** Contratos del catálogo público (GET /categories, GET /brands). */
export interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  children: Category[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

export type Gender = "MEN" | "WOMEN" | "UNISEX";
export type ProductOrigin = "LOCAL" | "IMPORTED_STOCK";

export interface ProductImage {
  id: string;
  url: string;
  alt?: string;
  position: number;
}

/** Tarjeta del listado (GET /products). */
export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  colorway?: string;
  brand?: { name: string; slug: string };
  gender: Gender;
  origin: ProductOrigin;
  base_price_cop: number;
  compare_at_price_cop: number;
  discount_percent: number;
  is_new_release: boolean;
  is_featured: boolean;
  in_stock: boolean;
  image?: ProductImage;
  hover_image?: ProductImage;
}

export interface Variant {
  id: string;
  sku: string;
  size: string;
  size_system: "EU" | "US" | "ALPHA" | "ONE";
  price_cop: number;
  /** Unidades vendibles ahora (stock físico − reservado). */
  available: number;
  in_stock: boolean;
}

/** Ficha (GET /products/:slug). */
export interface ProductDetail extends ProductSummary {
  description?: string;
  category?: { name: string; slug: string };
  images: ProductImage[];
  variants: Variant[];
}
