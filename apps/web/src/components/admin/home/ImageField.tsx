"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import Image from "next/image";
import { useId, useState } from "react";

import { isApiError } from "@/lib/api-client";
import { uploadImage } from "@/lib/catalog-admin";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
  error?: string;
  hint?: string;
  /** Proporción de la vista previa, ej. "aspect-[16/9]". */
  ratio?: string;
}

/** Sube una foto y guarda su URL. Muestra vista previa y permite cambiarla o quitarla. */
export function ImageField({ label, value, onChange, error, hint, ratio = "aspect-[16/9]" }: Props) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    setLocalError(null);
    if (!TYPES.includes(file.type)) return setLocalError("Solo se aceptan fotos JPG, PNG o WebP.");
    if (file.size > MAX_BYTES) return setLocalError("Pesa más de 5 MB. Comprímela e inténtalo de nuevo.");
    setBusy(true);
    try {
      onChange((await uploadImage(file)).url);
    } catch (err) {
      setLocalError(isApiError(err) ? (Object.values(err.fieldErrors)[0] ?? err.message) : "No pudimos subir la foto. Inténtalo de nuevo.");
    }
    setBusy(false);
  }

  const msg = localError ?? error;
  return (
    <div>
      <span className="sb-label">{label}</span>
      <div className={`border-line bg-surface-raised relative overflow-hidden border ${ratio} max-h-64`}>
        {value ? (
          <Image src={value} alt="Vista previa" fill sizes="400px" unoptimized className="object-cover" />
        ) : (
          <div className="text-ink-muted body-sm flex h-full items-center justify-center">Sin foto</div>
        )}
        {busy && (
          <div role="status" className="bg-surface/80 absolute inset-0 flex items-center justify-center gap-2">
            <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Subiendo…
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label htmlFor={id} className="sb-btn sb-btn--secondary cursor-pointer">
          <ImagePlus className="size-4" strokeWidth={1.5} aria-hidden />
          {value ? "Cambiar foto" : "Subir foto"}
        </label>
        <input id={id} type="file" accept={TYPES.join(",")} className="sr-only" onChange={onFile} disabled={busy} aria-invalid={msg ? true : undefined} aria-describedby={msg ? `${id}-err` : undefined} />
        {value && (
          <button type="button" onClick={() => onChange("")} className="body-sm text-danger inline-flex min-h-11 items-center gap-1 underline underline-offset-4">
            <Trash2 className="size-4" strokeWidth={1.5} aria-hidden /> Quitar
          </button>
        )}
      </div>
      {msg ? (
        <p id={`${id}-err`} role="alert" className="sb-field-error">
          {msg}
        </p>
      ) : (
        hint && <p className="sb-field-hint">{hint}</p>
      )}
    </div>
  );
}
