"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { http } from "@/lib/api-client";
import type { AdminProduct } from "@/types";

interface Props {
  slugs: string[];
  max: number;
  onChange: (slugs: string[]) => void;
  error?: string;
}

/** Elige a mano los productos de una sección: busca por nombre entre los publicados y ordénalos. */
export function ProductPicker({ slugs, max, onChange, error }: Props) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminProduct[]>([]);
  const [searching, setSearching] = useState(false);

  // Nombres de los productos ya elegidos (la lista guarda solo el slug).
  useEffect(() => {
    const missing = slugs.filter((s) => !(s in names));
    if (missing.length === 0) return;
    let alive = true;
    Promise.allSettled(missing.map((s) => http.get<{ name: string }>(`/products/${encodeURIComponent(s)}`).then((p) => [s, p.name] as const))).then((r) => {
      if (!alive) return;
      setNames((n) => ({ ...n, ...Object.fromEntries(r.map((x, i) => (x.status === "fulfilled" ? x.value : [missing[i], `${missing[i]} (no disponible)`]))) }));
    });
    return () => {
      alive = false;
    };
  }, [slugs, names]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      setSearching(true);
      http
        .get<AdminProduct[]>("/admin/products", { params: { q: term, status: "ACTIVE", limit: 8 } })
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const shown = q.trim().length >= 2 ? results : [];
  const full = slugs.length >= max;
  const move = (i: number, d: -1 | 1) => {
    const next = [...slugs];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <p className="sb-label">Productos de la sección ({slugs.length}/{max})</p>
      {slugs.length === 0 ? (
        <p className="body-sm text-ink-muted">Aún no hay productos. Búscalos abajo y agrégalos.</p>
      ) : (
        <ol className="divide-line border-line divide-y border">
          {slugs.map((s, i) => (
            <li key={s} className="flex items-center gap-2 px-3 py-1">
              <span className="body-sm min-w-0 flex-1 truncate">{names[s] ?? s}</span>
              <button type="button" aria-label={`Subir ${names[s] ?? s}`} disabled={i === 0} onClick={() => move(i, -1)} className="inline-flex size-11 items-center justify-center disabled:opacity-30">
                <ArrowUp className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
              <button type="button" aria-label={`Bajar ${names[s] ?? s}`} disabled={i === slugs.length - 1} onClick={() => move(i, 1)} className="inline-flex size-11 items-center justify-center disabled:opacity-30">
                <ArrowDown className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
              <button type="button" aria-label={`Quitar ${names[s] ?? s}`} onClick={() => onChange(slugs.filter((x) => x !== s))} className="text-danger inline-flex size-11 items-center justify-center">
                <X className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div>
        <label className="sb-label" htmlFor={`pp-${slugs.length}-q`}>
          Buscar producto publicado
        </label>
        <input id={`pp-${slugs.length}-q`} className="sb-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe al menos 2 letras" autoComplete="off" disabled={full} />
        {full && <p className="sb-field-hint">Llegaste al máximo de {max} productos.</p>}
        {searching && <p role="status" className="body-sm text-ink-muted mt-2">Buscando…</p>}
        {shown.length > 0 && (
          <ul className="border-line mt-2 divide-y border">
            {shown.map((p) => {
              const added = slugs.includes(p.slug);
              return (
                <li key={p.id} className="flex items-center gap-2 px-3 py-1">
                  <span className="body-sm min-w-0 flex-1 truncate">
                    {p.name}
                    {p.colorway ? ` · ${p.colorway}` : ""}
                  </span>
                  <button
                    type="button"
                    disabled={added || full}
                    onClick={() => {
                      setNames((n) => ({ ...n, [p.slug]: p.name }));
                      onChange([...slugs, p.slug]);
                    }}
                    className="label text-ink inline-flex min-h-11 items-center gap-1 px-2 underline underline-offset-4 disabled:no-underline disabled:opacity-40"
                  >
                    <Plus className="size-4" strokeWidth={1.5} aria-hidden />
                    {added ? "Ya está" : "Agregar"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {q.trim().length >= 2 && !searching && shown.length === 0 && <p className="body-sm text-ink-muted mt-2">Sin resultados entre los productos publicados.</p>}
      </div>
      {error && (
        <p role="alert" className="sb-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
