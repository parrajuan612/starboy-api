import { z } from "zod";

import { DEPARTMENTS } from "@/lib/colombia";

/** Cédula/NIT/CE/pasaporte: se aceptan puntos, guiones y espacios al escribir y se normalizan (la API pide 5–20 letras o números). */
export const normalizeDocument = (v: string) => v.replace(/[\s.\-]/g, "").toUpperCase();

/** Celular colombiano: 10 dígitos que empiezan por 3 (con o sin +57). También se acepta fijo con indicativo (60 + 8 dígitos). */
export function normalizePhone(v: string): string {
  const digits = v.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("57") ? digits.slice(2) : digits;
}

export const checkoutSchema = z.object({
  first_name: z.string().trim().min(2, "Escribe tu nombre.").max(70, "Máximo 70 caracteres."),
  last_name: z.string().trim().min(2, "Escribe tus apellidos.").max(70, "Máximo 70 caracteres."),
  document_id: z
    .string()
    .transform(normalizeDocument)
    .pipe(z.string().regex(/^[A-Z0-9]{5,20}$/, "Escribe tu cédula o documento (5 a 20 números o letras).")),
  phone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.string().regex(/^(3\d{9}|60\d{8})$/, "Escribe un celular de 10 dígitos, por ejemplo 300 123 4567.")),
  department: z.enum(DEPARTMENTS, { error: "Elige tu departamento." }),
  city: z.string().trim().min(2, "Escribe tu ciudad o municipio.").max(80, "Máximo 80 caracteres."),
  line1: z.string().trim().min(5, "Escribe la dirección completa, por ejemplo Calle 10 # 20-30.").max(200, "Máximo 200 caracteres."),
  line2: z.string().trim().max(200, "Máximo 200 caracteres.").optional(),
  notes: z.string().trim().max(300, "Máximo 300 caracteres.").optional(),
});

export type CheckoutData = z.output<typeof checkoutSchema>;

/** Lo que hay en los inputs (todo texto, aún sin validar). */
export type CheckoutForm = Record<keyof CheckoutData, string>;

export const EMPTY_CHECKOUT: CheckoutForm = {
  first_name: "", last_name: "", document_id: "", phone: "", department: "", city: "", line1: "", line2: "", notes: "",
};
