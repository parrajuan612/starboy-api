import { useEffect, useState } from "react";

/** Devuelve `value` tras `ms` sin cambios (para no consultar la API en cada tecla). */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
