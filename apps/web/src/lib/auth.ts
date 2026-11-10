import { http } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import type { AuthSession } from "@/types";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  full_name: string;
  phone?: string;
  document_id?: string;
}

export async function login(input: LoginInput): Promise<void> {
  useAuthStore.getState().setSession(await http.post<AuthSession>("/auth/login", input));
}

export async function register(input: RegisterInput): Promise<void> {
  useAuthStore.getState().setSession(await http.post<AuthSession>("/auth/register", input));
}

/** Cierra la sesión en la API (borra la cookie de refresh) y en el navegador. Siempre limpia lo local. */
export async function logout(): Promise<void> {
  try {
    await http.post("/auth/logout");
  } finally {
    useAuthStore.getState().clear();
  }
}

/**
 * Solo permite volver a rutas internas. Evita el "open redirect" (?next=https://sitio-malo.com o //sitio-malo.com).
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return fallback;
  if (/^\/(login|registro)(\/|\?|$)/.test(next)) return fallback;
  return next;
}
