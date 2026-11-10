"use client";

import { useEffect } from "react";

import { refreshAccessToken } from "@/lib/api-client";
import { hasSessionHint } from "@/lib/session-hint";
import { useAuthStore } from "@/store/auth";

/**
 * Restaura la sesión al cargar la página: el access token vive en memoria, así que tras recargar se
 * recupera con la cookie httpOnly de refresh. Sin pista de sesión ni se llama a la API (visita anónima).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const { status, accessToken } = useAuthStore.getState();
    if (accessToken || status !== "loading") return;
    if (!hasSessionHint()) {
      useAuthStore.getState().setAnonymous();
      return;
    }
    void refreshAccessToken();
  }, []);

  return children;
}
