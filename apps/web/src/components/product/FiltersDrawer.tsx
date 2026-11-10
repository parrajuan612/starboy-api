"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { FilterPanel } from "./FilterPanel";

type PanelProps = Omit<React.ComponentProps<typeof FilterPanel>, "idPrefix" | "onDone">;

/** Filtros en móvil: botón + <dialog> modal desde la derecha (foco atrapado, Escape y velo cierran). */
export function FiltersDrawer({ activeCount, ...panel }: PanelProps & { activeCount: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && dialog.current?.close();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="sb-btn sb-btn--secondary lg:hidden">
        <SlidersHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
        Filtros{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>

      <dialog
        ref={dialog}
        aria-label="Filtros"
        onClick={(e) => e.target === dialog.current && close()}
        className="sb-filterdrawer bg-surface-raised text-ink fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(92vw,380px)] max-w-none overflow-y-auto p-0 shadow-drawer backdrop:bg-sb-ink/60"
      >
        <div className="border-line bg-surface-raised sticky top-0 z-10 flex h-16 items-center justify-between border-b px-4">
          <h2 className="display-sm">Filtros</h2>
          <button type="button" aria-label="Cerrar filtros" onClick={close} className="inline-flex size-11 items-center justify-center">
            <X className="size-6" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <div className="p-4">
          <FilterPanel {...panel} idPrefix="m" onDone={close} />
        </div>
      </dialog>
    </>
  );
}
