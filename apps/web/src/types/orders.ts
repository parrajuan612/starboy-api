/** Contratos de órdenes y pagos de la tienda (POST /orders, GET /orders/:id, /payments/…). */

export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export interface OrderItem {
  variant_id: string;
  product_name: string;
  sku: string;
  size: string;
  quantity: number;
  unit_price_cop: number;
  line_total_cop: number;
}

export interface OrderHistoryEntry {
  status: OrderStatus;
  label: string;
  note?: string;
  created_at: string;
}

/** Foto de la dirección de envío guardada en la orden. */
export interface ShippingAddress {
  recipient_name: string;
  phone: string;
  department: string;
  city: string;
  dane_code?: string;
  line1: string;
  line2?: string;
  notes?: string;
}

export interface Order {
  id: string;
  code: string;
  status: OrderStatus;
  status_label: string;
  subtotal_cop: number;
  discount_cop: number;
  shipping_cop: number;
  total_cop: number;
  shipping_address: ShippingAddress;
  notes?: string;
  /** Hasta cuándo se guarda el stock mientras no haya pago. */
  reserved_until?: string;
  carrier?: string;
  tracking_number?: string;
  item_count: number;
  items: OrderItem[];
  history?: OrderHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "DECLINED" | "REFUNDED";

export interface Payment {
  id: string;
  order_id?: string;
  import_request_id?: string;
  provider: string;
  provider_ref?: string;
  kind: string;
  amount_cop: number;
  status: PaymentStatus;
  status_label: string;
  /** Solo mientras el pago está pendiente. */
  checkout_url?: string;
}
