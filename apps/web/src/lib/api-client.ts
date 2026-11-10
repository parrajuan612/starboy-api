import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";

import { useAuthStore } from "@/store/auth";
import type { ApiErrorBody, AuthSession, Envelope } from "@/types";

/**
 * Cliente HTTP de la API de Go.
 * - baseURL relativa: Next reenvía /api/v1/* a la API (ver rewrites en next.config.ts), así la cookie
 *   de refresh httpOnly viaja en el mismo origen, sin CORS.
 * - El access token vive solo en memoria (store de Zustand): nunca en localStorage.
 */
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_PATH ?? "/api/v1",
  withCredentials: true,
  timeout: 15_000,
});

/** Error normalizado: lo que las pantallas deben capturar. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** Errores por campo (ej. { "items[0].quantity": "…" }) o datos extra, tal como los manda la API. */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Mensajes por campo para pintar bajo cada input. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.details ?? {})) if (typeof v === "string") out[k] = v;
    return out;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

// ── Request: adjunta el access token ─────────────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token && !config.headers.has("Authorization")) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

// ── Refresh de un solo vuelo: varias 401 simultáneas (o el arranque de la página) comparten una renovación ──
let refreshing: Promise<string | null> | null = null;

/**
 * Renueva el access token con la cookie httpOnly. Devuelve el token nuevo o null.
 * - La API rechazó la sesión (401/403): se cierra la sesión local y se borra la pista.
 * - Falla de red o 5xx: no se borra la pista (puede ser un corte momentáneo); solo queda anónimo en memoria.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= axios
    .post<Envelope<AuthSession>>(`${api.defaults.baseURL}/auth/refresh`, null, { withCredentials: true, timeout: 15_000 })
    .then((res) => {
      useAuthStore.getState().setSession(res.data.data);
      return res.data.data.access_token;
    })
    .catch((e: unknown) => {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 401 || status === 403) useAuthStore.getState().clear();
      else useAuthStore.getState().setAnonymous();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Retriable = AxiosRequestConfig & { _retried?: boolean };

const isAuthCall = (url?: string) => /\/auth\/(login|register|refresh|logout)/.test(url ?? "");

// ── Response: 401 → renueva y reintenta una vez; todo error se normaliza a ApiError ──
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as Retriable | undefined;

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall(original.url)) {
      original._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api.request(original);
      }
    }

    const body = error.response?.data?.error;
    if (body) throw new ApiError(error.response!.status, body.code, body.message, body.details);
    if (error.response) throw new ApiError(error.response.status, "HTTP_ERROR", "Algo salió mal. Inténtalo de nuevo.");
    throw new ApiError(0, "NETWORK_ERROR", "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
  },
);

/** Atajos que devuelven directamente `data` del sobre { data }. */
export const http = {
  get: async <T>(url: string, config?: AxiosRequestConfig) => (await api.get<Envelope<T>>(url, config)).data.data,
  post: async <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    (await api.post<Envelope<T>>(url, body, config)).data.data,
  patch: async <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    (await api.patch<Envelope<T>>(url, body, config)).data.data,
  delete: async <T>(url: string, config?: AxiosRequestConfig) => (await api.delete<Envelope<T>>(url, config)).data.data,
};
