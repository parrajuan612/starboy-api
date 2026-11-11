/** Contratos de gestión de catálogo y ajustes del panel (solo ADMIN). */

import type { Gender, ProductOrigin } from "./catalog";

export type ProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type SizeSystem = "EU" | "US" | "ALPHA" | "ONE";

export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  is_active: boolean;
}

export interface AdminCategory {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
}

export interface AdminImage {
  id: string;
  url: string;
  alt?: string;
  position: number;
  public_id: string;
}

export interface AdminVariant {
  id: string;
  sku: string;
  size: string;
  size_system: SizeSystem;
  price_override_cop: number | null;
  price_cop: number;
  stock_on_hand: number;
  stock_reserved: number;
  available: number;
  sort_order: number;
}

export interface AdminProduct {
  id: string;
  brand?: { id: string; name: string; slug: string };
  category?: { id: string; name: string; slug: string };
  name: string;
  slug: string;
  colorway?: string;
  description?: string;
  gender: Gender;
  origin: ProductOrigin;
  status: ProductStatus;
  base_price_cop: number;
  compare_at_price_cop: number;
  cost_cop: number;
  is_new_release: boolean;
  is_featured: boolean;
  published_at: string | null;
  image_count: number;
  images_missing: number;
  variant_count: number;
  images?: AdminImage[];
  variants?: AdminVariant[];
}

export interface ProductInput {
  brand_id: string;
  category_id: string;
  name: string;
  colorway: string;
  description: string;
  gender: Gender;
  origin: ProductOrigin;
  base_price_cop: number;
  compare_at_price_cop: number;
  cost_cop: number;
  is_new_release: boolean;
  is_featured: boolean;
}

export interface VariantInput {
  sku: string;
  size: string;
  size_system: SizeSystem;
  price_override_cop?: number;
  stock_on_hand: number;
}

export interface UploadedFile {
  public_id: string;
  url: string;
}

export interface BusinessSetting {
  key: string;
  label: string;
  help: string;
  unit: "COP" | "USD" | "%" | "h" | "";
  min: number;
  max: number;
  value: number;
  updated_at?: string;
}

export interface AdminRate {
  id: string;
  name: string;
  avg_weight_lb: number;
  freight_cop: number;
  handling_cop: number;
  insurance_cop: number;
  national_delivery_cop: number;
  margin_cop: number;
  flat_fee_cop: number;
  max_declared_usd_cents: number;
  requires_manual_quote: boolean;
  notes?: string;
  is_active: boolean;
  sort_order: number;
}

export interface RateInput {
  name: string;
  avg_weight_lb: number;
  freight_cop: number;
  handling_cop: number;
  insurance_cop: number;
  national_delivery_cop: number;
  margin_cop: number;
  max_declared_usd_cents: number;
  requires_manual_quote: boolean;
  notes: string;
  is_active: boolean;
  sort_order: number;
}
