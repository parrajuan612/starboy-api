import { ShoppingBag } from "lucide-react";
import Link from "next/link";

/** Carrito vacío con llamado a la acción para volver a la tienda. */
export function EmptyCart({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "gap-3 px-6 py-16" : "gap-4 py-20"}`}>
      <ShoppingBag className="text-ink-muted size-12" strokeWidth={1.5} aria-hidden />
      <h2 className="display-sm">Tu carrito está vacío</h2>
      <p className="body text-ink-muted max-w-sm">Agrega tus sneakers y prendas favoritas y las verás aquí.</p>
      <Link href="/productos" onClick={onNavigate} className="sb-btn sb-btn--primary mt-2">
        Ir a la tienda
      </Link>
      <p className="body-sm text-ink-muted">
        O mira{" "}
        <Link href="/hombre" onClick={onNavigate} className="text-ink underline underline-offset-4">
          Hombre
        </Link>{" "}
        y{" "}
        <Link href="/mujer" onClick={onNavigate} className="text-ink underline underline-offset-4">
          Mujer
        </Link>
        .
      </p>
    </div>
  );
}
