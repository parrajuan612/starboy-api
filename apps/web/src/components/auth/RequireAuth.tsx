"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuthStore } from "@/store/auth";
import type { Role } from "@/types";

/**
 * Guard de pantalla para rutas privadas. `proxy.ts` ya filtra a quien no tiene pista de sesión; este
 * componente confirma la sesión real (tras restaurarla) y, si se pide, el rol. La API valida el rol
 * igualmente en cada endpoint: esto solo decide qué se muestra.
 */
export function RequireAuth({ roles, children }: { roles?: readonly Role[]; children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status !== "authenticated" || !user) {
    return (
      <div role="status" className="body text-ink-muted flex items-center gap-2 p-8">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden />
        Cargando tu sesión…
      </div>
    );
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="max-w-md space-y-4 p-8">
        <ShieldAlert className="text-danger size-8" strokeWidth={1.5} aria-hidden />
        <h1 className="display-md">Sin acceso</h1>
        <p className="body text-ink-muted">Tu cuenta no tiene permiso para ver esta sección.</p>
        <Link href="/" className="sb-btn sb-btn--secondary">
          Volver al inicio
        </Link>
      </div>
    );
  }

  return children;
}
