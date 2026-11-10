/**
 * Cookie "pista" de sesión (no es secreta ni da acceso): indica que este navegador tiene una sesión
 * que vale la pena intentar restaurar. La cookie real de refresh es httpOnly y su path es
 * /api/v1/auth, así que ni `proxy.ts` ni el JS de la página pueden verla.
 *
 * Sirve para dos cosas: (1) que `proxy.ts` redirija a /login sin renderizar rutas privadas, y
 * (2) no llamar a /auth/refresh en cada visita anónima. La seguridad real la pone la API en cada endpoint.
 */
export const SESSION_HINT = "sb_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // igual a JWT_REFRESH_TTL (168 h)

const attrs = () => `; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;

export function setSessionHint(on: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = on
    ? `${SESSION_HINT}=1${attrs()}; Max-Age=${MAX_AGE_SECONDS}`
    : `${SESSION_HINT}=${attrs()}; Max-Age=0`;
}

export function hasSessionHint(): boolean {
  return typeof document !== "undefined" && document.cookie.split("; ").some((c) => c.startsWith(`${SESSION_HINT}=`));
}
