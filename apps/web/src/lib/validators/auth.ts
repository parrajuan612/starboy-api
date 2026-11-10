import { z } from "zod";

/** Reglas espejo de la API (auth/dto.go). La API sigue siendo la fuente de verdad. */
const email = z
  .string()
  .trim()
  .min(1, "Escribe tu correo.")
  .max(255, "Es demasiado largo.")
  .pipe(z.email("Escribe un correo válido."));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Escribe tu contraseña.").max(72, "Máximo 72 caracteres."),
});

export const registerSchema = z.object({
  full_name: z.string().trim().min(2, "Escribe tu nombre completo (mínimo 2 caracteres).").max(150, "Máximo 150 caracteres."),
  email,
  password: z.string().min(8, "Usa al menos 8 caracteres.").max(72, "Máximo 72 caracteres."),
  phone: z.string().trim().max(30, "Máximo 30 caracteres.").optional(),
  document_id: z.string().trim().max(30, "Máximo 30 caracteres.").optional(),
});
