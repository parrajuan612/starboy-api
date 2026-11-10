"use client";

import { Columns3, List, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { ImportDetailPanel } from "@/components/admin/ImportDetailPanel";
import { Pager } from "@/components/admin/Pager";
import { Alert, Button } from "@/components/ui";
import { useDebounced } from "@/hooks/useDebounced";
import { usePagedList } from "@/hooks/usePagedList";
import { ApiError } from "@/lib/api-client";
import { formatCOP, formatDate } from "@/lib/format";
import { IMPORT_COLUMNS, IMPORT_LABEL, IMPORT_STATUSES, importBadge } from "@/lib/import-status";
import { getPage } from "@/lib/paged";
import type { ImportRequest } from "@/types";

type View = "board" | "list";
const BOARD_PAGES = 4; // 4 × 50 = las 200 solicitudes más recientes

export function ImportsAdmin() {
  const [view, setView] = useState<View>("board");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // sube al cambiar algo en el detalle: refresca tablero/lista
  const dq = useDebounced(q.trim());

  return (
    <section aria-labelledby="imp-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="imp-title" className="display-md">Encargos USA</h1>
        <div role="group" aria-label="Vista" className="flex">
          <ViewBtn active={view === "board"} onClick={() => setView("board")} icon={<Columns3 className="size-5" strokeWidth={1.5} aria-hidden />}>Tablero</ViewBtn>
          <ViewBtn active={view === "list"} onClick={() => setView("list")} icon={<List className="size-5" strokeWidth={1.5} aria-hidden />}>Lista</ViewBtn>
        </div>
      </div>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="mt-6">
        <label htmlFor="imp-q" className="sr-only">Buscar por código</label>
        <div className="relative max-w-md">
          <Search className="text-ink-muted pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2" strokeWidth={1.5} aria-hidden />
          <input id="imp-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código (IMP-000012)" className="sb-input pl-10" />
        </div>
      </form>

      <div className="mt-6">
        {view === "board" ? (
          <Board q={dq} version={version} onOpen={setOpenId} />
        ) : (
          <ListView q={dq} version={version} onOpen={setOpenId} />
        )}
      </div>

      <AdminDrawer open={openId !== null} title="Detalle del encargo" onClose={() => setOpenId(null)}>
        {openId && <ImportDetailPanel key={openId} id={openId} onChanged={() => setVersion((v) => v + 1)} />}
      </AdminDrawer>
    </section>
  );
}

function ViewBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`label inline-flex min-h-11 items-center gap-2 border px-4 ${active ? "bg-brand text-on-brand border-brand" : "border-line-strong hover:border-ink"}`}>
      {icon}
      {children}
    </button>
  );
}

function Board({ q, version, onOpen }: { q: string; version: number; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<ImportRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      let all: ImportRequest[] = [];
      for (let p = 1; p <= BOARD_PAGES; p++) {
        const res = await getPage<ImportRequest>("/admin/imports", { q, page: p, limit: 50 }, signal);
        all = all.concat(res.data);
        if (p >= res.meta.total_pages) {
          setTruncated(false);
          break;
        }
        if (p === BOARD_PAGES) setTruncated(true);
      }
      setItems(all);
      setError(null);
    } catch (e) {
      if (!signal.aborted) setError(e instanceof ApiError ? e.message : "No pudimos cargar los encargos.");
    }
  }, [q]);

  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de datos remotos
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, version]);

  if (error) return <Alert>{error}</Alert>;
  if (!items)
    return (
      <p role="status" className="body text-ink-muted flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando encargos…
      </p>
    );

  return (
    <>
      {truncated && <p className="body-sm text-ink-muted mb-3">Se muestran las {BOARD_PAGES * 50} solicitudes más recientes. Usa la lista para ver el resto.</p>}
      {/* El tablero se desplaza dentro de su propio contenedor: la página nunca crece a lo ancho. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0" tabIndex={0} role="region" aria-label="Tablero de encargos">
        <div className="flex min-w-max items-start gap-4">
          {IMPORT_COLUMNS.map((col) => {
            const cards = items.filter((i) => col.statuses.includes(i.status));
            return (
              <section key={col.id} aria-labelledby={`col-${col.id}`} className="bg-surface-raised border-line w-72 shrink-0 border">
                <h2 id={`col-${col.id}`} className="label border-line flex items-center justify-between border-b p-3">
                  {col.title}
                  <span className="sb-badge sb-badge--neutral" aria-label={`${cards.length} encargos`}>{cards.length}</span>
                </h2>
                <ul className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
                  {cards.length === 0 && <li className="caption text-ink-muted p-3 text-center">Sin encargos</li>}
                  {cards.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => onOpen(c.id)} className="bg-surface border-line hover:border-line-strong w-full border p-3 text-left">
                        <span className="flex items-start justify-between gap-2">
                          <span className="body-strong">{c.code}</span>
                          <span className={`sb-badge ${importBadge(c.status)}`}>{IMPORT_LABEL[c.status]}</span>
                        </span>
                        <span className="body-sm mt-1 block truncate">{c.customer?.full_name ?? "Lote propio"}</span>
                        <span className="caption text-ink-muted mt-1 block">
                          {c.item_count} {c.item_count === 1 ? "producto" : "productos"}
                          {c.quote ? ` · ${formatCOP(c.quote.total_cop)}` : ""}
                        </span>
                        <span className="caption text-ink-muted block">{formatDate(c.created_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ListView({ q, version, onOpen }: { q: string; version: number; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { rows, meta, loading, error } = usePagedList<ImportRequest>("/admin/imports", { status, q }, page, 20, version);

  return (
    <div>
      <div>
        <label htmlFor="imp-status" className="sr-only">Estado</label>
        <select id="imp-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sb-input sm:w-64">
          <option value="">Todos los estados</option>
          {IMPORT_STATUSES.map((s) => (
            <option key={s} value={s}>{IMPORT_LABEL[s]}</option>
          ))}
        </select>
      </div>

      <div className="mt-6" aria-busy={loading}>
        {error && <Alert>{error}</Alert>}
        {!error && !loading && rows.length === 0 && <p className="body text-ink-muted border-line border border-dashed p-8 text-center">No hay encargos con esos filtros.</p>}
        {rows.length > 0 && (
          <>
            <div className="border-line hidden overflow-x-auto border md:block">
              <table className="body-sm w-full text-left">
                <caption className="sr-only">Encargos USA</caption>
                <thead className="bg-surface-raised border-line border-b">
                  <tr className="label">
                    <th scope="col" className="p-3">Código</th>
                    <th scope="col" className="p-3">Cliente</th>
                    <th scope="col" className="p-3">Estado</th>
                    <th scope="col" className="p-3 text-right">Productos</th>
                    <th scope="col" className="p-3 text-right">Cotización</th>
                    <th scope="col" className="p-3">Fecha</th>
                    <th scope="col" className="p-3"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-line bg-surface-raised divide-y">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="body-strong p-3 whitespace-nowrap">{r.code}</th>
                      <td className="p-3">
                        <span className="block">{r.customer?.full_name ?? "Lote propio"}</span>
                        {r.customer && <span className="text-ink-muted block break-all">{r.customer.email}</span>}
                      </td>
                      <td className="p-3"><span className={`sb-badge ${importBadge(r.status)}`}>{IMPORT_LABEL[r.status]}</span></td>
                      <td className="p-3 text-right tabular-nums">{r.item_count}</td>
                      <td className="p-3 text-right tabular-nums whitespace-nowrap">{r.quote ? formatCOP(r.quote.total_cop) : "—"}</td>
                      <td className="p-3 whitespace-nowrap">{formatDate(r.created_at)}</td>
                      <td className="p-3 text-right">
                        <button type="button" onClick={() => onOpen(r.id)} aria-label={`Ver encargo ${r.code}`} className="sb-btn sb-btn--secondary min-h-11">Ver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="bg-surface-raised border-line border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="body-strong">{r.code}</p>
                    <span className={`sb-badge ${importBadge(r.status)}`}>{IMPORT_LABEL[r.status]}</span>
                  </div>
                  <p className="body-sm mt-1">{r.customer?.full_name ?? "Lote propio"}</p>
                  <p className="caption text-ink-muted">{r.item_count} productos{r.quote ? ` · ${formatCOP(r.quote.total_cop)}` : ""} · {formatDate(r.created_at)}</p>
                  <Button variant="secondary" className="mt-3 w-full" onClick={() => onOpen(r.id)} aria-label={`Ver encargo ${r.code}`}>Ver detalle</Button>
                </li>
              ))}
            </ul>
          </>
        )}
        {meta && <Pager page={meta.page} totalPages={meta.total_pages} total={meta.total} onPage={setPage} disabled={loading} />}
      </div>
    </div>
  );
}
