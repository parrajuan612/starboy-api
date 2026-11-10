"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/lib/api-client";
import { getPage } from "@/lib/paged";
import type { PageMeta } from "@/types";

type Params = Record<string, string | number | undefined>;

/**
 * Lista paginada del panel. Cancela la consulta anterior cuando cambian los filtros (la respuesta vieja
 * nunca pisa a la nueva) y expone `reload` para refrescar tras una acción.
 */
export function usePagedList<T>(url: string, params: Params, page: number, limit = 20, refresh = 0) {
  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(params);

  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de datos remotos
    setLoading(true);
    getPage<T>(url, { ...(JSON.parse(key) as Params), page, limit }, ctrl.signal)
      .then((res) => {
        setRows(res.data);
        setMeta(res.meta);
        setError(null);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof ApiError ? e.message : "No pudimos cargar los datos.");
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [url, key, page, limit, tick, refresh]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { rows, meta, loading, error, reload };
}
