"use client";

import { Search, X } from "lucide-react";
import { useRef, useState } from "react";

/** Botón de búsqueda que despliega una barra bajo el navbar. Es un formulario GET normal: /buscar?q=… */
export function SearchToggle() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="search-panel"
        aria-label={open ? "Cerrar búsqueda" : "Buscar"}
        className="inline-flex size-11 items-center justify-center"
      >
        {open ? <X className="size-6" strokeWidth={1.5} aria-hidden /> : <Search className="size-6" strokeWidth={1.5} aria-hidden />}
      </button>

      {open && (
        <div
          id="search-panel"
          className="bg-surface-raised border-line absolute inset-x-0 top-full z-40 border-t"
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <form role="search" action="/buscar" method="get" className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 md:px-8">
            <label htmlFor="search-q" className="sr-only">
              Buscar productos
            </label>
            <input
              id="search-q"
              name="q"
              type="search"
              required
              maxLength={100}
              autoFocus
              autoComplete="off"
              placeholder="Busca zapatillas, hoodies, marcas…"
              className="sb-input"
            />
            <button type="submit" className="sb-btn sb-btn--primary shrink-0">
              Buscar
            </button>
          </form>
        </div>
      )}
    </>
  );
}
