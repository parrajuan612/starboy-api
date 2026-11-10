"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Panel lateral de detalle: <dialog> modal (foco atrapado, Escape y velo cierran). */
export function AdminDrawer({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="sb-filterdrawer bg-surface-raised text-ink fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(100vw,560px)] max-w-none overflow-y-auto p-0 shadow-drawer backdrop:bg-sb-ink/60"
    >
      {open && (
        <>
          <div className="border-line bg-surface-raised sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b px-4">
            <h2 className="display-sm truncate">{title}</h2>
            <button type="button" aria-label="Cerrar" onClick={() => ref.current?.close()} className="inline-flex size-11 shrink-0 items-center justify-center">
              <X className="size-6" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          <div className="p-4 md:p-6">{children}</div>
        </>
      )}
    </dialog>
  );
}
