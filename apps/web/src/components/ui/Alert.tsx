import { AlertCircle } from "lucide-react";

/** Error de formulario. Lleva ícono y texto: el color nunca va solo (manual §12.3, regla 4). */
export function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="sb-alert sb-alert--danger">
      <AlertCircle className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
      <p>{children}</p>
    </div>
  );
}
