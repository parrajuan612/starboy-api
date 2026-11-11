"use client";

import { Boxes, ClipboardList, Globe2, Settings, Shirt, Tags } from "lucide-react";
import Link from "next/link";

import { useAuthStore } from "@/store/auth";

const CARDS = [
  { href: "/admin/ordenes", title: "Órdenes", text: "Cambia el estado, despacha y revisa los datos de facturación.", icon: ClipboardList },
  { href: "/admin/inventario", title: "Inventario", text: "Stock por talla y la bitácora de movimientos.", icon: Boxes },
  { href: "/admin/encargos", title: "Encargos USA", text: "Cotiza y sigue cada encargo hasta la entrega.", icon: Globe2 },
  { href: "/admin/productos", title: "Productos", text: "Crea productos, tallas, stock y fotos, y publícalos en la tienda.", icon: Shirt, adminOnly: true },
  { href: "/admin/catalogo", title: "Catálogo", text: "Marcas y categorías de la tienda.", icon: Tags, adminOnly: true },
  { href: "/admin/ajustes", title: "Ajustes", text: "Dólar, comisión, impuestos y tarifas de los encargos.", icon: Settings, adminOnly: true },
] as const;

export default function AdminDashboardPage() {
  const role = useAuthStore((s) => s.user?.role);
  const cards = CARDS.filter((c) => !("adminOnly" in c) || role === "ADMIN");
  return (
    <>
      <h1 className="display-md">Panel</h1>
      <p className="body text-ink-muted mt-2">¿Qué vas a gestionar hoy?</p>
      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className="bg-surface-raised border-line hover:border-line-strong block h-full border p-5">
              <c.icon className="text-brand size-6" strokeWidth={1.5} aria-hidden />
              <h2 className="display-sm mt-3">{c.title}</h2>
              <p className="body-sm text-ink-muted mt-1">{c.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
