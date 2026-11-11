"use client";

import { AlertCircle, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Pager } from "@/components/admin/Pager";
import { Alert, ButtonLink } from "@/components/ui";
import { useDebounced } from "@/hooks/useDebounced";
import { usePagedList } from "@/hooks/usePagedList";
import { formatCOP } from "@/lib/format";
import { PRODUCT_STATUS_LABEL, productBadge } from "@/lib/product-status";
import type { AdminProduct } from "@/types";

/** Lista de productos del catálogo (borradores, publicados y archivados) con búsqueda y filtro por estado. */
export function ProductsAdmin() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q.trim());
  const { rows, meta, loading, error } = usePagedList<AdminProduct>("/admin/products", { q: dq, status }, page, 20);

  return (
    <section aria-labelledby="pr-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="pr-title" className="display-md">
          Productos
        </h1>
        <ButtonLink href="/admin/productos/nuevo">
          <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Nuevo producto
        </ButtonLink>
      </div>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="pr-q" className="sr-only">Buscar producto</label>
          <Search className="text-ink-muted pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2" strokeWidth={1.5} aria-hidden />
          <input id="pr-q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Nombre o referencia" className="sb-input pl-10" />
        </div>
        <div>
          <label htmlFor="pr-s" className="sr-only">Estado</label>
          <select id="pr-s" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sb-input sm:w-52">
            <option value="">Todos los estados</option>
            <option value="DRAFT">Borradores</option>
            <option value="ACTIVE">Publicados</option>
            <option value="ARCHIVED">Archivados</option>
          </select>
        </div>
      </form>

      <div className="mt-6" aria-busy={loading}>
        {error && <Alert>{error}</Alert>}
        {!error && !loading && rows.length === 0 && (
          <div className="border-line border border-dashed p-10 text-center">
            <p className="body text-ink-muted">{q || status ? "No hay productos con esos filtros." : "Aún no hay productos."}</p>
            {!q && !status && (
              <ButtonLink href="/admin/productos/nuevo" className="mt-4">
                Crear el primero
              </ButtonLink>
            )}
          </div>
        )}
        {rows.length > 0 && (
          <ul aria-label="Lista de productos" className="divide-line bg-surface-raised border-line divide-y border">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/productos/${p.id}`} className="hover:bg-surface flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4">
                  <span className="min-w-0">
                    <span className="body-strong block truncate">{p.name}</span>
                    <span className="body-sm text-ink-muted block">
                      {[p.brand?.name, p.category?.name, p.colorway].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {p.status !== "ARCHIVED" && p.images_missing > 0 && (
                      <span className="body-sm text-danger flex items-center gap-1">
                        <AlertCircle className="size-4" strokeWidth={1.5} aria-hidden />
                        Faltan {p.images_missing} {p.images_missing === 1 ? "foto" : "fotos"}
                      </span>
                    )}
                    <span className="body-sm text-ink-muted">{p.variant_count} {p.variant_count === 1 ? "talla" : "tallas"}</span>
                    <span className="body-strong tabular-nums">{formatCOP(p.base_price_cop)}</span>
                    <span className={`sb-badge ${productBadge(p.status)}`}>{PRODUCT_STATUS_LABEL[p.status]}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {meta && rows.length > 0 && <Pager page={page} totalPages={meta.total_pages} total={meta.total} onPage={setPage} disabled={loading} />}
      </div>
    </section>
  );
}
