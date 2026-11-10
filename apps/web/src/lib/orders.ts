import { http } from "@/lib/api-client";
import type { CheckoutData } from "@/lib/validators/checkout";
import type { CartLine } from "@/store/cart";
import type { Order, Payment } from "@/types";

/** Llave de idempotencia: identifica un intento de compra. Con la misma llave la API devuelve la orden ya creada. */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID(); // solo en contextos seguros (https/localhost)
  const b = c.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** POST /orders. Los precios NO se envían: el servidor los calcula con el catálogo vigente. */
export function createOrder(lines: CartLine[], data: CheckoutData, idempotencyKey: string): Promise<Order> {
  return http.post<Order>(
    "/orders",
    {
      items: lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
      document_id: data.document_id,
      shipping_address: {
        recipient_name: `${data.first_name} ${data.last_name}`.replace(/\s+/g, " ").trim(),
        phone: data.phone,
        department: data.department,
        city: data.city,
        line1: data.line1,
        ...(data.line2 ? { line2: data.line2 } : {}),
        ...(data.notes ? { notes: data.notes } : {}),
      },
    },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
}

export const getOrder = (id: string) => http.get<Order>(`/orders/${encodeURIComponent(id)}`);

/** POST /payments/checkout: abre (o recupera) el cobro pendiente de la orden. El monto sale del servidor. */
export const createPayment = (orderId: string) => http.post<Payment>("/payments/checkout", { order_id: orderId, provider: "SANDBOX" });

export const getPayment = (id: string) => http.get<Payment>(`/payments/${encodeURIComponent(id)}`);

/** Solo existe fuera de producción (pasarela de pruebas). */
export const simulatePayment = (id: string, outcome: "approved" | "declined") =>
  http.post<Payment>(`/payments/${encodeURIComponent(id)}/simulate`, { outcome });

/**
 * Ruta interna de la pasarela a la que se manda al cliente. La API entrega una URL absoluta con SU idea de nuestro
 * dominio (WEB_BASE_URL); aquí solo se usa el path, así que no depende de en qué puerto o dominio corra la web
 * y nunca se redirige a un origen externo. Se agrega `pid` porque la pasarela de pruebas necesita el id del pago.
 */
export function paymentPath(p: Payment): string | null {
  if (!p.checkout_url) return null;
  try {
    const path = new URL(p.checkout_url).pathname;
    return path.startsWith("/pago/") ? `${path}?pid=${encodeURIComponent(p.id)}` : null;
  } catch {
    return null;
  }
}

export const confirmationPath = (orderId: string, qs = "") => `/checkout/confirmacion/${orderId}${qs}`;
