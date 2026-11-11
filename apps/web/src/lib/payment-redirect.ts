import { paymentPath } from "@/lib/orders";
import type { Payment } from "@/types";

/**
 * Hosts externos a los que se permite mandar al cliente a pagar (NEXT_PUBLIC_PAYMENT_HOSTS, separados por coma).
 * Es una lista cerrada: la `checkout_url` viene de la API, pero la web solo sigue enlaces que reconoce, así una
 * URL inesperada nunca se convierte en una redirección abierta.
 */
const HOSTS = (process.env.NEXT_PUBLIC_PAYMENT_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export type PaymentTarget = { kind: "internal"; path: string } | { kind: "external"; url: string };

/** A dónde mandar al cliente: una pantalla nuestra (pasarela de pruebas) o el sitio seguro de la pasarela. */
export function paymentTarget(p: Payment): PaymentTarget | null {
  const internal = paymentPath(p);
  if (internal) return { kind: "internal", path: internal };
  if (!p.checkout_url) return null;
  try {
    const u = new URL(p.checkout_url);
    if (u.protocol === "https:" && HOSTS.includes(u.hostname.toLowerCase())) return { kind: "external", url: u.toString() };
  } catch {
    /* URL inválida */
  }
  return null;
}

/** Lleva al cliente a pagar. Devuelve false si no hay un destino válido (el llamante muestra el error). */
export function goToPayment(p: Payment, router: { push: (path: string) => void }): boolean {
  const t = paymentTarget(p);
  if (!t) return false;
  if (t.kind === "internal") router.push(t.path);
  else window.location.assign(t.url);
  return true;
}
