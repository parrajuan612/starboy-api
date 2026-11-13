import Link from "next/link";
import type { ReactNode } from "react";

/** Enlace del contenido editable: rutas de la tienda con Link; https:// en pestaña nueva. Sin URL, no es un enlace. */
export function SmartLink({ href, className, children, ariaLabel }: { href: string; className?: string; children: ReactNode; ariaLabel?: string }) {
  if (!href) return <div className={className}>{children}</div>;
  if (href.startsWith("/")) return <Link href={href} className={className} aria-label={ariaLabel}>{children}</Link>;
  return (
    <a href={href} className={className} aria-label={ariaLabel} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
