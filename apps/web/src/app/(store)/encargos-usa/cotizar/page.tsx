import type { Metadata } from "next";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { ImportRequestForm } from "@/components/imports/RequestForm";

export const metadata: Metadata = { title: "Solicitar cotización · Encargos USA", robots: { index: false } };

export default function QuotePage() {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-14">
        <p className="label text-ink-muted mb-2">Encargos USA</p>
        <h1 className="display-lg">Traemos cualquier referencia</h1>
        <p className="body text-ink-muted mt-3 max-w-xl">Pega el enlace del producto y te respondemos con una cotización formal, válida por 48 horas.</p>
        <div className="mt-10">
          <ImportRequestForm />
        </div>
      </div>
    </RequireAuth>
  );
}
