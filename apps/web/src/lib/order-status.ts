import type { OrderStatus } from "@/types";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagada",
  PROCESSING: "En preparación",
  SHIPPED: "Enviada",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
};

/** Camino feliz de una orden, en orden. CANCELLED queda fuera: es una rama aparte. */
export const ORDER_STEPS: readonly OrderStatus[] = ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

/** Variante visual de `sb-badge` para cada estado (el color nunca va solo: siempre hay texto). */
export const ORDER_BADGE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "sb-badge--neutral",
  PAID: "sb-badge--brand-outline",
  PROCESSING: "sb-badge--brand-outline",
  SHIPPED: "sb-badge--brand-outline",
  DELIVERED: "sb-badge--success",
  CANCELLED: "sb-badge--danger",
};
