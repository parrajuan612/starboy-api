"use client";

import { Boxes, ClipboardList, CreditCard, Globe2, House, LayoutDashboard, Settings, Shirt, Tags } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/ui";
import { useAuthStore } from "@/store/auth";

const ITEMS = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard, exact: true },
  { href: "/admin/ordenes", label: "Órdenes", icon: ClipboardList },
  { href: "/admin/inventario", label: "Inventario", icon: Boxes },
  { href: "/admin/encargos", label: "Encargos USA", icon: Globe2 },
  // Gestión del catálogo y del negocio: solo ADMIN (la API lo exige igualmente).
  { href: "/admin/pagos", label: "Pagos", icon: CreditCard, adminOnly: true },
  { href: "/admin/inicio", label: "Inicio", icon: House, adminOnly: true },
  { href: "/admin/productos", label: "Productos", icon: Shirt, adminOnly: true },
  { href: "/admin/catalogo", label: "Catálogo", icon: Tags, adminOnly: true },
  { href: "/admin/ajustes", label: "Ajustes", icon: Settings, adminOnly: true },
] as const;

/** Navegación del panel: barra lateral en escritorio; en móvil, franja superior que se desplaza sola (sin ensanchar la página). */
export function AdminNav() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const links = ITEMS.filter((it) => !("adminOnly" in it) || role === "ADMIN").map((it) => {
    const active = "exact" in it ? pathname === it.href : pathname.startsWith(it.href);
    const Icon = it.icon;
    return (
      <li key={it.href}>
        <Link
          href={it.href}
          aria-current={active ? "page" : undefined}
          className={`label flex min-h-11 items-center gap-2 px-3 whitespace-nowrap md:px-4 ${active ? "bg-brand text-on-brand" : "text-ink-muted hover:text-ink"}`}
        >
          <Icon className="size-5" strokeWidth={1.5} aria-hidden />
          {it.label}
        </Link>
      </li>
    );
  });

  return (
    <>
      <aside className="theme-editorial bg-surface text-ink border-line hidden border-r p-6 md:block">
        <Link href="/admin" aria-label="Panel Starboy" className="block">
          <Logo />
        </Link>
        <p className="caption text-ink-muted mt-1">Panel</p>
        <nav aria-label="Panel" className="mt-8">
          <ul className="space-y-1">{links}</ul>
        </nav>
        <Link href="/" className="body-sm text-ink-muted hover:text-ink mt-10 inline-block underline-offset-4 hover:underline">
          ← Ir a la tienda
        </Link>
      </aside>
      <nav aria-label="Panel" className="theme-editorial bg-surface text-ink border-line overflow-x-auto border-b md:hidden">
        <ul className="flex min-w-max">{links}</ul>
      </nav>
    </>
  );
}
