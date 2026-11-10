import type { ZodError } from "zod";

import { ApiError } from "@/lib/api-client";

export type FieldErrors = Record<string, string>;

/** Zod → { campo: primer mensaje }. */
export function zodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out;
}

/**
 * ApiError → errores por campo + mensaje general.
 * `fields` son los inputs que tiene el formulario: un error de un campo desconocido no se pierde, va al mensaje general.
 */
export function apiFormErrors(
  e: unknown,
  fields: readonly string[],
  codeToField: Record<string, string> = {},
): { fieldErrors: FieldErrors; formError: string | null } {
  if (!(e instanceof ApiError)) {
    return { fieldErrors: {}, formError: "Algo salió mal. Inténtalo de nuevo." };
  }
  const fieldErrors: FieldErrors = {};
  let leftover: string | null = null;
  for (const [k, msg] of Object.entries(e.fieldErrors)) {
    if (fields.includes(k)) fieldErrors[k] = msg;
    else leftover ??= msg;
  }
  const mapped = codeToField[e.code];
  if (mapped) fieldErrors[mapped] = e.message;
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, formError: leftover };
  return { fieldErrors, formError: leftover ?? e.message };
}

/** Lleva el foco al primer campo inválido (accesibilidad). */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}
