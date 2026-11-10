import { z } from "zod";

import { DEPARTMENTS } from "@/lib/colombia";
import { normalizeDocument, normalizePhone } from "@/lib/validators/checkout";

/** Perfil: celular y documento son opcionales, pero si se escriben deben ser válidos. */
export const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Escribe tu nombre completo (mínimo 2 caracteres).").max(150, "Máximo 150 caracteres."),
  phone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.string().regex(/^(3\d{9}|60\d{8})?$/, "Escribe un celular de 10 dígitos, por ejemplo 300 123 4567.")),
  document_id: z
    .string()
    .transform(normalizeDocument)
    .pipe(z.string().regex(/^([A-Z0-9]{5,20})?$/, "Escribe tu cédula o documento (5 a 20 números o letras).")),
});
export type ProfileForm = Record<keyof z.input<typeof profileSchema>, string>;

export const addressSchema = z.object({
  label: z.string().trim().max(50, "Máximo 50 caracteres.").optional(),
  department: z.enum(DEPARTMENTS, { error: "Elige el departamento." }),
  city: z.string().trim().min(2, "Escribe la ciudad o municipio.").max(80, "Máximo 80 caracteres."),
  line1: z.string().trim().min(5, "Escribe la dirección completa, por ejemplo Calle 10 # 20-30.").max(200, "Máximo 200 caracteres."),
  line2: z.string().trim().max(200, "Máximo 200 caracteres.").optional(),
  notes: z.string().trim().max(300, "Máximo 300 caracteres.").optional(),
});
export type AddressForm = Record<keyof z.input<typeof addressSchema>, string>;
export const EMPTY_ADDRESS: AddressForm = { label: "", department: "", city: "", line1: "", line2: "", notes: "" };
