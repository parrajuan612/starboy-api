"use client";

import { ArrowLeft, ArrowRight, ImagePlus } from "lucide-react";
import Image from "next/image";
import { useId, useState } from "react";

import { ConfirmButton } from "@/components/admin/catalog/ConfirmButton";
import { Alert } from "@/components/ui";
import { isApiError } from "@/lib/api-client";
import { addImage, deleteImage, reorderImages, uploadImage } from "@/lib/catalog-admin";
import type { AdminProduct } from "@/types";

export const MIN_IMAGES = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

const errText = (e: unknown) => (isApiError(e) ? (Object.values(e.fieldErrors)[0] ?? e.message) : "Algo salió mal. Inténtalo de nuevo.");

interface Props {
  product: AdminProduct;
  onChange: (p: AdminProduct) => void;
}

/** Fotos del producto: subir (varias a la vez), ordenar y eliminar. La primera es la principal. */
export function ImagesEditor({ product, onChange }: Props) {
  const inputId = useId();
  const images = [...(product.images ?? [])].sort((a, b) => a.position - b.position);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (files.length === 0 || busy) return;
    setBusy(true);
    setErrors([]);
    const failed: string[] = [];
    let current = product;
    for (const [i, file] of files.entries()) {
      setProgress(`Subiendo ${i + 1} de ${files.length}…`);
      if (!TYPES.includes(file.type)) {
        failed.push(`${file.name}: solo se aceptan fotos JPG, PNG o WebP.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        failed.push(`${file.name}: pesa más de 5 MB. Comprímela e inténtalo de nuevo.`);
        continue;
      }
      try {
        const up = await uploadImage(file);
        current = await addImage(product.id, { ...up, alt: product.name });
      } catch (err) {
        failed.push(`${file.name}: ${errText(err)}`);
      }
    }
    onChange(current);
    setErrors(failed);
    setProgress(null);
    setBusy(false);
  }

  async function move(index: number, dir: -1 | 1) {
    const ids = images.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setErrors([]);
    try {
      onChange(await reorderImages(product.id, ids));
    } catch (err) {
      setErrors([errText(err)]);
    }
  }

  async function remove(id: string) {
    setErrors([]);
    try {
      onChange(await deleteImage(product.id, id));
    } catch (err) {
      setErrors([errText(err)]);
    }
  }

  const missing = Math.max(MIN_IMAGES - images.length, 0);

  return (
    <section aria-labelledby="im-title" className="space-y-5">
      <div>
        <h2 id="im-title" className="display-sm">
          Fotos
        </h2>
        <p className="body-sm text-ink-muted mt-1">
          Mínimo {MIN_IMAGES} para publicar: de perfil, superior, trasera, suela o detalle, sobre fondo blanco. La primera es la principal. JPG, PNG o WebP de hasta 5 MB.
        </p>
        <p role="status" className={`body-sm mt-2 font-semibold ${missing > 0 ? "text-danger" : "text-success"}`}>
          {missing > 0 ? `Faltan ${missing} ${missing === 1 ? "foto" : "fotos"} para poder publicar (${images.length} de ${MIN_IMAGES}).` : `${images.length} fotos: listo para publicar.`}
        </p>
      </div>

      {errors.length > 0 && (
        <Alert>
          <ul className="space-y-1">
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}

      {images.length > 0 && (
        <ul aria-label="Fotos del producto" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((im, i) => (
            <li key={im.id} className="bg-surface-raised border-line border">
              <div className="relative aspect-square bg-white">
                <Image src={im.url} alt={im.alt || product.name} fill sizes="200px" unoptimized className="object-contain" />
                {i === 0 && <span className="sb-badge sb-badge--brand absolute top-2 left-2">Principal</span>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 p-2">
                <span className="flex">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Mover la foto ${i + 1} a la izquierda`} className="inline-flex size-11 items-center justify-center disabled:opacity-30">
                    <ArrowLeft className="size-5" strokeWidth={1.5} aria-hidden />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label={`Mover la foto ${i + 1} a la derecha`} className="inline-flex size-11 items-center justify-center disabled:opacity-30">
                    <ArrowRight className="size-5" strokeWidth={1.5} aria-hidden />
                  </button>
                </span>
                <ConfirmButton label="Eliminar" ariaLabel={`Eliminar la foto ${i + 1}`} onConfirm={() => remove(im.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onFiles} disabled={busy} className="sr-only" />
        <label htmlFor={inputId} className={`sb-btn sb-btn--secondary cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          <ImagePlus className="size-4" strokeWidth={1.5} aria-hidden />
          {progress ?? "Subir fotos"}
        </label>
      </div>
    </section>
  );
}
