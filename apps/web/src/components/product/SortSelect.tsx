"use client";

import { useRouter } from "next/navigation";

interface Props {
  value: string;
  options: { label: string; href: string; value: string }[];
}

/** Orden del listado: cambia la URL (el servidor vuelve a consultar). Sin JS no se puede usar: queda también dentro del formulario de filtros. */
export function SortSelect({ value, options }: Props) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-select" className="sb-label !mb-0 hidden sm:block">
        Ordenar
      </label>
      <select
        id="sort-select"
        value={value}
        onChange={(e) => router.push(options.find((o) => o.value === e.target.value)!.href)}
        className="sb-input !w-auto min-w-48"
        aria-label="Ordenar productos"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
