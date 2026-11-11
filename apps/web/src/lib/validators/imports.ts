import type { FieldErrors } from "@/lib/forms";
import { normalizeDocument } from "@/lib/validators/checkout";
import type { CreateImportInput } from "@/types";

/** "129.99", "129,99", "$1,299.99" → centavos (12999). null si no es un monto válido. */
export function parseUSDToCents(raw: string): number | null {
  const s = raw.replace(/USD|\$|\s/gi, "");
  if (!s) return null;
  const sep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let int = s;
  let dec = "";
  // Un separador con 1–2 dígitos detrás es decimal; con 3 es de miles (1,299).
  if (sep >= 0 && s.length - sep - 1 <= 2) {
    int = s.slice(0, sep);
    dec = s.slice(sep + 1);
  }
  int = int.replace(/[.,]/g, "");
  if (!/^\d+$/.test(int) || !/^\d{0,2}$/.test(dec)) return null;
  return Number(int) * 100 + Number((dec + "00").slice(0, 2));
}

export interface ItemForm {
  product_url: string;
  store_name: string;
  description: string;
  size: string;
  color: string;
  quantity: string;
  price_usd: string;
  import_rate_id: string;
}

export interface RequestForm {
  document_id: string;
  customer_notes: string;
  items: ItemForm[];
}

export const EMPTY_ITEM: ItemForm = { product_url: "", store_name: "", description: "", size: "", color: "", quantity: "1", price_usd: "", import_rate_id: "" };
export const MAX_ITEMS = 10;
export const MAX_USD_CENTS = 10_000_000;

/** Errores por campo con la clave `${indice}.${campo}` para los ítems y `document_id` / `customer_notes` para el resto. */
export function validateRequest(form: RequestForm, needsDocument: boolean): { errors: FieldErrors; data?: CreateImportInput } {
  const errors: FieldErrors = {};
  const doc = normalizeDocument(form.document_id);
  if (needsDocument && !/^[A-Z0-9]{5,20}$/.test(doc)) errors.document_id = "Escribe tu cédula o documento (5 a 20 números o letras).";
  if (form.customer_notes.length > 2000) errors.customer_notes = "Máximo 2000 caracteres.";

  const items: CreateImportInput["items"] = [];
  form.items.forEach((it, i) => {
    const k = (f: string) => `${i}.${f}`;
    const url = it.product_url.trim();
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") errors[k("product_url")] = "El enlace debe empezar por https://";
    } catch {
      errors[k("product_url")] = "Pega el enlace completo del producto, por ejemplo https://www.nike.com/…";
    }
    if (url.length > 2000) errors[k("product_url")] = "El enlace es demasiado largo.";
    const description = it.description.trim();
    if (description.length < 2) errors[k("description")] = "Cuéntanos qué producto es (mínimo 2 caracteres).";
    else if (description.length > 300) errors[k("description")] = "Máximo 300 caracteres.";
    if (it.store_name.trim().length > 80) errors[k("store_name")] = "Máximo 80 caracteres.";
    if (it.size.trim().length > 20) errors[k("size")] = "Máximo 20 caracteres.";
    if (it.color.trim().length > 60) errors[k("color")] = "Máximo 60 caracteres.";
    const quantity = Number(it.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) errors[k("quantity")] = "Entre 1 y 50 unidades.";
    const cents = parseUSDToCents(it.price_usd);
    if (cents === null || cents <= 0) errors[k("price_usd")] = "Escribe el precio en dólares, por ejemplo 129.99.";
    else if (cents > MAX_USD_CENTS) errors[k("price_usd")] = "El precio es demasiado alto para un solo artículo.";
    if (!it.import_rate_id) errors[k("import_rate_id")] = "Elige la categoría del producto.";

    items.push({
      product_url: url,
      ...(it.store_name.trim() ? { store_name: it.store_name.trim() } : {}),
      description,
      ...(it.size.trim() ? { size: it.size.trim() } : {}),
      ...(it.color.trim() ? { color: it.color.trim() } : {}),
      quantity,
      declared_price_usd_cents: cents ?? 0,
      import_rate_id: it.import_rate_id,
    });
  });

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    data: {
      items,
      ...(needsDocument ? { document_id: doc } : {}),
      ...(form.customer_notes.trim() ? { customer_notes: form.customer_notes.trim() } : {}),
    },
  };
}
