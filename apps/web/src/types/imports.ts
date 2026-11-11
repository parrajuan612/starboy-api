/** Contratos de Encargos USA para el cliente (/imports/*). ImportRequest e ImportStatus viven en admin.ts. */

export interface ImportRate {
  id: string;
  name: string;
  flat_fee_cop: number;
  requires_manual_quote: boolean;
  notes?: string;
}

export interface EstimateBreakdown {
  product_cop: number;
  logistics_cop: number;
  service_fee_cop: number;
  taxes_cop: number;
  total_cop: number;
  deposit_percent: number;
  deposit_cop: number;
  balance_cop: number;
}

export interface Estimate {
  is_estimate: boolean;
  requires_manual_quote: boolean;
  message?: string;
  fob_usd_cents: number;
  exchange_rate_cop: number;
  tax_exempt_threshold_usd: number;
  taxes_applied: boolean;
  breakdown?: EstimateBreakdown;
}

export interface EstimateItemInput {
  import_rate_id: string;
  price_usd_cents: number;
  us_shipping_usd_cents: number;
  quantity: number;
}

export interface ImportItemInput {
  product_url: string;
  store_name?: string;
  description: string;
  size?: string;
  color?: string;
  quantity: number;
  declared_price_usd_cents: number;
  import_rate_id: string;
}

export interface CreateImportInput {
  customer_notes?: string;
  document_id?: string;
  items: ImportItemInput[];
}
