/** Contratos del panel (/admin/orders, /admin/inventory, /admin/imports). */

import type { Order, OrderHistoryEntry, OrderStatus } from "./orders";

export interface AdminOrderHistory extends OrderHistoryEntry {
  changed_by_id?: string;
  /** Vacío = lo hizo el sistema. */
  changed_by_name?: string;
}

export interface AdminOrder extends Omit<Order, "history"> {
  user_id?: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  customer_document?: string;
  allowed_next: OrderStatus[];
  history?: AdminOrderHistory[];
}

export interface UpdateOrderStatusResult {
  order: AdminOrder;
  stock_effect?: "RELEASED" | "RESTOCKED";
  refund_required?: boolean;
}

export interface StockRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  brand: string;
  product_status: string;
  sku: string;
  size: string;
  stock_on_hand: number;
  stock_reserved: number;
  available: number;
}

export type MovementType = "RESERVE" | "RELEASE" | "COMMIT" | "RESTOCK" | "ADJUSTMENT";

export interface InventoryMovement {
  id: string;
  created_at: string;
  type: MovementType;
  variant_id: string;
  sku: string;
  size: string;
  product_name: string;
  order_id?: string;
  order_code?: string;
  delta_on_hand: number;
  delta_reserved: number;
  on_hand_after: number;
  reserved_after: number;
  reason?: string;
  actor_id?: string;
  /** Vacío = proceso automático. */
  actor_name?: string;
}

export type ImportStatus =
  | "REQUESTED" | "QUOTED" | "ACCEPTED" | "PAID" | "PURCHASED" | "IN_US_WAREHOUSE" | "IN_TRANSIT"
  | "IN_CUSTOMS" | "IN_CO_WAREHOUSE" | "BALANCE_DUE" | "OUT_FOR_DELIVERY" | "DELIVERED" | "REJECTED"
  | "EXPIRED" | "CANCELLED";

export interface ImportQuote {
  id: string;
  version: number;
  status: "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  is_expired: boolean;
  product_cop: number;
  logistics_cop: number;
  service_fee_cop: number;
  taxes_cop: number;
  total_cop: number;
  taxes_applied: boolean;
  deposit_percent: number;
  deposit_cop: number;
  balance_cop: number;
  balance_cod_allowed: boolean;
  valid_until: string;
  notes_customer?: string;
}

export interface ImportItem {
  id: string;
  product_url: string;
  store_name?: string;
  description: string;
  size?: string;
  color?: string;
  quantity: number;
  declared_price_usd_cents: number;
  screenshot_url?: string;
  rate_name?: string;
}

export interface ImportHistory {
  status: ImportStatus;
  label: string;
  note?: string;
  notify_customer: boolean;
  created_at: string;
}

export interface ImportRequest {
  id: string;
  code: string;
  type: "CUSTOMER_ORDER" | "STORE_RESTOCK";
  status: ImportStatus;
  status_label: string;
  customer_notes?: string;
  carrier_usa?: string;
  tracking_usa?: string;
  tracking_co?: string;
  weight_lb: number;
  eta?: string;
  customer?: { id: string; full_name: string; email: string; phone?: string; document_id?: string };
  allowed_next?: ImportStatus[];
  quote?: ImportQuote;
  item_count: number;
  items?: ImportItem[];
  history?: ImportHistory[];
  created_at: string;
  updated_at: string;
}
