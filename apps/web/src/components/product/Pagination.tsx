import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

interface Props {
  page: number;
  totalPages: number;
  /** URL de una página dada (conserva los filtros). */
  hrefFor: (page: number) => string;
}

function windowed(page: number, total: number): (number | "…")[] {
  const set = new Set([1, total, page - 1, page, page + 1].filter((n) => n >= 1 && n <= total));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

const cell = "inline-flex min-h-11 min-w-11 items-center justify-center border px-2 body-sm";

export function Pagination({ page, totalPages, hrefFor }: Props) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginación" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" aria-label="Página anterior" className={`${cell} border-line-strong hover:border-ink`}>
          <ChevronLeft className="size-5" strokeWidth={1.5} aria-hidden />
        </Link>
      ) : null}
      {windowed(page, totalPages).map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className={`${cell} border-transparent text-ink-muted`} aria-hidden>
            …
          </span>
        ) : n === page ? (
          <span key={n} aria-current="page" aria-label={`Página ${n}, actual`} className={`${cell} bg-brand text-on-brand border-brand`}>
            {n}
          </span>
        ) : (
          <Link key={n} href={hrefFor(n)} aria-label={`Ir a la página ${n}`} className={`${cell} border-line-strong hover:border-ink`}>
            {n}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} rel="next" aria-label="Página siguiente" className={`${cell} border-line-strong hover:border-ink`}>
          <ChevronRight className="size-5" strokeWidth={1.5} aria-hidden />
        </Link>
      ) : null}
    </nav>
  );
}
