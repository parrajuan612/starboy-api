import { create } from "zustand";

import { setSessionHint } from "@/lib/session-hint";
import type { AuthSession, User } from "@/types";

/** loading: aún no sabemos si hay sesión (restaurando); las rutas privadas esperan este estado. */
export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** Solo en memoria. Al recargar se recupera con la cookie de refresh (POST /auth/refresh). */
  accessToken: string | null;
  setSession: (session: AuthSession) => void;
  /** Actualiza solo los datos del usuario (perfil editado) sin tocar el token. */
  setUser: (user: User) => void;
  /** Cierra la sesión local y borra la pista (sesión terminada o rechazada por la API). */
  clear: () => void;
  /** No hay sesión en memoria pero la pista se conserva (p. ej. la API no respondió al restaurar). */
  setAnonymous: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  accessToken: null,
  setSession: (s) => {
    setSessionHint(true);
    set({ status: "authenticated", user: s.user, accessToken: s.access_token });
  },
  setUser: (user) => set({ user }),
  clear: () => {
    setSessionHint(false);
    set({ status: "anonymous", user: null, accessToken: null });
  },
  setAnonymous: () => set({ status: "anonymous", user: null, accessToken: null }),
}));

export const selectIsBackoffice = (s: AuthState) => s.user?.role === "ADMIN" || s.user?.role === "STAFF";
