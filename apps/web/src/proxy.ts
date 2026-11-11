import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protege /cuenta, /admin, /checkout, /pago y /encargos-usa/cotizar (la API exige sesión para crear órdenes; se quita de aquí cuando exista el checkout de invitado): sin pista de sesión (cookie `sb_session`, ver lib/session-hint.ts) manda a /login
 * y evita renderizar la ruta privada. Es una barrera de UX, NO de seguridad: la pista la puede crear cualquiera.
 * La autorización real ocurre en la API (JWT + rol en cada endpoint) y en <RequireAuth> para el rol.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("sb_session")) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/cuenta/:path*", "/admin/:path*", "/checkout/:path*", "/pago/:path*", "/encargos-usa/cotizar"],
};
