import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  disabled?: boolean;
}

const btn = "inline-flex min-h-11 min-w-11 items-center justify-center border border-line-strong hover:border-ink disabled:cursor-not-allowed disabled:opacity-40";

/** Paginación por botones (el estado vive en el componente, no en la URL). */
export function Pager({ page, totalPages, total, onPage, disabled }: Props) {
  return (
    <nav aria-label="Paginación" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="body-sm text-ink-muted">
        {total} {total === 1 ? "resultado" : "resultados"}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Página anterior" className={btn} disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="size-5" strokeWidth={1.5} aria-hidden />
          </button>
          <span className="body-sm tabular-nums">
            Página {page} de {totalPages}
          </span>
          <button type="button" aria-label="Página siguiente" className={btn} disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)}>
            <ChevronRight className="size-5" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      )}
    </nav>
  );
}
