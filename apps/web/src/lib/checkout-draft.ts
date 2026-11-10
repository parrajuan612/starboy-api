import type { CartLine } from "@/store/cart";
import { newIdempotencyKey } from "@/lib/orders";
import type { CheckoutForm } from "@/lib/validators/checkout";

/**
 * Borrador del formulario y llave de idempotencia en sessionStorage (se borra al cerrar la pestaña).
 * El borrador evita reescribir la dirección si se recarga o se vuelve atrás; la llave hace seguro el reintento.
 */
const DRAFT = "sb-checkout-draft";
const ATTEMPT = "sb-checkout-attempt";

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento lleno o bloqueado: se sigue sin borrador */
  }
}

export const loadDraft = () => read<Partial<CheckoutForm>>(DRAFT) ?? {};
export const saveDraft = (v: CheckoutForm) => write(DRAFT, v);
export const clearDraft = () => sessionStorage.removeItem(DRAFT);

/** Firma del intento: mismas prendas y mismos datos → misma llave (reintento); algo distinto → llave nueva. */
const signature = (lines: CartLine[], data: unknown) =>
  JSON.stringify({ l: lines.map((l) => [l.variantId, l.quantity]).sort(), d: data });

export function attemptKey(lines: CartLine[], data: unknown): string {
  const sig = signature(lines, data);
  const prev = read<{ sig: string; key: string }>(ATTEMPT);
  if (prev?.sig === sig) return prev.key;
  const key = newIdempotencyKey();
  write(ATTEMPT, { sig, key });
  return key;
}

/** Se llama cuando el intento terminó (orden creada o rechazo definitivo): el próximo intento usará una llave nueva. */
export const clearAttempt = () => sessionStorage.removeItem(ATTEMPT);
