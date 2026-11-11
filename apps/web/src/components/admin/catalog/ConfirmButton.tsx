"use client";

import { useState } from "react";

interface Props {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  /** Texto accesible que dice qué se va a eliminar. */
  ariaLabel?: string;
}

/** Acción destructiva en dos pasos (sin window.confirm): primero «Eliminar», luego «Sí, eliminar» o «Cancelar». */
export function ConfirmButton({ label, confirmLabel = "Sí, eliminar", onConfirm, disabled, ariaLabel }: Props) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button type="button" disabled={disabled} aria-label={ariaLabel} onClick={() => setAsking(true)} className="body-sm text-danger inline-flex min-h-11 items-center px-2 underline underline-offset-4 disabled:opacity-40">
        {label}
      </button>
    );
  }
  return (
    <span role="group" aria-label="Confirmar" className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
        className="sb-btn sb-btn--secondary text-danger border-danger min-h-11"
      >
        {confirmLabel}
      </button>
      <button type="button" disabled={busy} onClick={() => setAsking(false)} className="body-sm inline-flex min-h-11 items-center px-2 underline underline-offset-4">
        Cancelar
      </button>
    </span>
  );
}
