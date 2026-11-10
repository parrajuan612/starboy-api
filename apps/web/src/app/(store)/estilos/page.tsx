import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "Guía de estilos" };

const SWATCHES = [
  { name: "sb-ink", cls: "bg-sb-ink text-sb-white", hex: "#05080F", role: "Fondo editorial" },
  { name: "sb-navy", cls: "bg-sb-navy text-sb-white", hex: "#182062", role: "Acción / botones" },
  { name: "sb-ice", cls: "bg-sb-ice text-sb-ink", hex: "#5F7DAD", role: "Acento (nunca botones)" },
  { name: "sb-paper", cls: "bg-sb-paper text-sb-ink border border-line-strong", hex: "#F3F3F3", role: "Papel / catálogo" },
];

/** Página de verificación de tokens, fuentes y tema. Solo existe fuera de producción. */
export default function StyleGuidePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 py-12 md:px-8">
      <section>
        <h1 className="display-lg">Guía de estilos</h1>
        <p className="body text-ink-muted mt-2">Tokens, tipografías y componentes base del manual de marca.</p>
      </section>

      <section className="space-y-4">
        <h2 className="display-md">Paleta</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {SWATCHES.map((s) => (
            <div key={s.name} className={`${s.cls} p-4`}>
              <p className="label">{s.name}</p>
              <p className="body-sm">{s.hex}</p>
              <p className="caption mt-6">{s.role}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="display-md">Tipografía</h2>
        <p className="display-lg">Oswald · Display</p>
        <p className="display-sm">Títulos en mayúsculas</p>
        <p className="label">Label · navegación y botones</p>
        <p className="title">Barlow · Air Jordan 4 Retro</p>
        <p className="price-lg">$ 1.249.900</p>
        <p className="body">Barlow para textos y párrafos. La marca nunca usa itálicas.</p>
        <p className="body-sm text-ink-muted">body-sm · metadatos y tablas</p>
      </section>

      <section className="space-y-4">
        <h2 className="display-md">Acciones</h2>
        <div className="flex flex-wrap gap-4">
          <Button>Agregar al carrito</Button>
          <Button variant="secondary">Ver detalle</Button>
          <span className="sb-badge sb-badge--discount">-40%</span>
          <span className="sb-badge sb-badge--success">En stock</span>
          <span className="sb-badge sb-badge--danger">Agotado</span>
        </div>
      </section>

      <section className="theme-editorial bg-surface text-ink space-y-2 p-8">
        <h2 className="display-md">Tema Editorial</h2>
        <p className="body text-ink-muted">Fondo sb-ink, texto claro, mismo botón de marca.</p>
        <Button>Comprar ahora</Button>
      </section>
    </div>
  );
}
