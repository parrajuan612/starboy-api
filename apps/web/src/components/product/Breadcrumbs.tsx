import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/** Migas de pan (§12.8): `body-sm` en ink-muted, separador «/», último nivel en `ink`. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Migas de pan" className="body-sm text-ink-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.label + i} className="flex items-center gap-2">
              {c.href && !last ? (
                <Link href={c.href} className="hover:text-ink underline-offset-4 hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className={last ? "text-ink" : ""} aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              )}
              {!last && <span aria-hidden>/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
