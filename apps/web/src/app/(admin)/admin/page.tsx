import { Boxes, ClipboardList, Globe2 } from "lucide-react";
import Link from "next/link";

const CARDS = [
  { href: "/admin/ordenes", title: "Órdenes", text: "Cambia el estado, despacha y revisa los datos de facturación.", icon: ClipboardList },
  { href: "/admin/inventario", title: "Inventario", text: "Stock por talla y la bitácora de movimientos.", icon: Boxes },
  { href: "/admin/encargos", title: "Encargos USA", text: "Cotiza y sigue cada encargo hasta la entrega.", icon: Globe2 },
] as const;

export default function AdminDashboardPage() {
  return (
    <>
      <h1 className="display-md">Panel</h1>
      <p className="body text-ink-muted mt-2">¿Qué vas a gestionar hoy?</p>
      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {CARDS.map((c) => (
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
