"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/cuenta", label: "Perfil", exact: true },
  { href: "/cuenta/direcciones", label: "Direcciones" },
  { href: "/cuenta/pedidos", label: "Mis pedidos" },
  { href: "/cuenta/encargos", label: "Mis encargos" },
] as const;

/** Pestañas del área de cuenta. En móvil se desplazan dentro de su propia franja, sin ensanchar la página. */
export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Mi cuenta" className="border-line mt-6 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-6">
        {TABS.map((t) => {
          const active = "exact" in t ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`label inline-flex min-h-11 items-center border-b-2 ${active ? "border-brand text-ink" : "text-ink-muted hover:text-ink border-transparent"}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
