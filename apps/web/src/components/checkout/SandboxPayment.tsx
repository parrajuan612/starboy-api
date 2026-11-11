"use client";

import { AlertCircle, CheckCircle2, FlaskConical, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert, Button } from "@/components/ui";
import { formatClock, useCountdown } from "@/hooks/useCountdown";
import { isApiError } from "@/lib/api-client";
import { formatCOP } from "@/lib/format";
import { createImportPayment, getMyImport, importPath } from "@/lib/imports";
import { confirmationPath, createPayment, getOrder, getPayment, paymentPath, simulatePayment } from "@/lib/orders";
import type { ImportRequest, Order, Payment } from "@/types";

/** Lo que se está pagando: una orden de la tienda o el anticipo de un encargo USA. */
type Subject =
  | { kind: "order"; id: string; label: string; code: string; reservedUntil?: string; pendingOrder: boolean }
  | { kind: "import"; id: string; label: string; code: string };

type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; payment: Payment; subject: Subject };

const orderSubject = (o: Order): Subject => ({ kind: "order", id: o.id, label: "Orden", code: o.code, reservedUntil: o.reserved_until, pendingOrder: o.status === "PENDING_PAYMENT" });
const importSubject = (r: ImportRequest): Subject => ({ kind: "import", id: r.id, label: "Encargo", code: r.code });

/** A dónde vuelve la persona según lo que pagó. */
const backPath = (s: Subject, qs = "") => (s.kind === "order" ? confirmationPath(s.id, qs) : importPath(s.id, qs));

/**
 * Pasarela de pagos de PRUEBA: es la `checkout_url` que entrega el backend (/pago/sandbox/{ref}).
 * No cobra nada: «aprobado» y «rechazado» llegan al backend por la misma ruta que un webhook real (POST /payments/:id/simulate).
 * Mercado Pago, cuando se integre, reemplaza esta pantalla por la suya.
 */
export function SandboxPayment({ providerRef, paymentId }: { providerRef: string; paymentId?: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>(paymentId ? { kind: "loading" } : { kind: "error", message: "El enlace de pago está incompleto. Vuelve a tu orden e inténtalo de nuevo." });
  const [busy, setBusy] = useState<"approved" | "declined" | "retry" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    if (!paymentId) return;
    let alive = true;
    getPayment(paymentId)
      .then(async (payment) => {
        // El id y la referencia deben corresponder: evita abrir un cobro ajeno cambiando solo la URL.
        if (payment.provider_ref !== providerRef) throw new Error("mismatch");
        let subject: Subject;
        if (payment.order_id) subject = orderSubject(await getOrder(payment.order_id));
        else if (payment.import_request_id) subject = importSubject(await getMyImport(payment.import_request_id));
        else throw new Error("mismatch");
        if (alive) setLoad({ kind: "ready", payment, subject });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const msg = isApiError(e) && e.status === 0 ? e.message : "No encontramos este pago. Vuelve a tu orden e inténtalo de nuevo.";
        setLoad({ kind: "error", message: msg });
      });
    return () => {
      alive = false;
    };
  }, [paymentId, providerRef]);

  const reservedUntil = load.kind === "ready" && load.subject.kind === "order" ? load.subject.reservedUntil : undefined;
  const left = useCountdown(reservedUntil);

  async function resolve(outcome: "approved" | "declined") {
    if (load.kind !== "ready" || busy) return;
    setBusy(outcome);
    setNotice(null);
    try {
      const p = await simulatePayment(load.payment.id, outcome);
      if (p.status === "APPROVED") {
        router.replace(backPath(load.subject, "?pago=aprobado"));
        return;
      }
      if (p.status === "DECLINED") setDeclined(true);
      else setNotice("Recibimos tu pago, pero lo estamos revisando. Te avisaremos cuando quede confirmado.");
    } catch (e) {
      setNotice(
        isApiError(e) && e.status === 404
          ? "La pasarela de pruebas no está disponible en este entorno."
          : isApiError(e)
            ? e.message
            : "No pudimos procesar el pago. Inténtalo de nuevo.",
      );
    }
    setBusy(null);
  }

  async function retry() {
    if (load.kind !== "ready") return;
    setBusy("retry");
    setNotice(null);
    try {
      const s = load.subject;
      const path = paymentPath(await (s.kind === "order" ? createPayment(s.id) : createImportPayment(s.id)));
      if (path) router.replace(path);
      else router.replace(backPath(s, "?pago=pendiente"));
    } catch (e) {
      setNotice(isApiError(e) ? e.message : "No pudimos abrir un nuevo intento de pago.");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 md:py-16">
      <div className="bg-surface-raised border-line border">
        <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-4">
          <p className="display-sm">Pasarela de pagos</p>
          <span className="sb-badge sb-badge--neutral gap-1.5">
            <FlaskConical className="size-3.5" strokeWidth={1.5} aria-hidden />
            Modo prueba
          </span>
        </div>

        <div className="space-y-6 p-5">
          {load.kind === "loading" && (
            <div role="status" className="body text-ink-muted flex items-center gap-2 py-8">
              <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden />
              Cargando tu pago…
            </div>
          )}

          {load.kind === "error" && (
            <>
              <Alert>{load.message}</Alert>
              <Link href="/cuenta" className="sb-btn sb-btn--secondary w-full">
                Ir a mi cuenta
              </Link>
            </>
          )}

          {load.kind === "ready" && (
            <>
              <dl className="space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="body text-ink-muted">{load.subject.label}</dt>
                  <dd className="body-strong">{load.subject.code}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="body text-ink-muted">Comercio</dt>
                  <dd className="body">Starboy</dd>
                </div>
                <div className="border-line flex items-baseline justify-between gap-4 border-t pt-3">
                  <dt className="body-strong">{load.subject.kind === "import" ? "Anticipo a pagar" : "Total a pagar"}</dt>
                  <dd className="price-lg tabular-nums">{formatCOP(load.payment.amount_cop)}</dd>
                </div>
              </dl>

              {load.payment.status === "APPROVED" ? (
                <>
                  <p className="text-success body flex items-center gap-2" role="status">
                    <CheckCircle2 className="size-5" strokeWidth={1.5} aria-hidden />
                    Este pago ya fue aprobado.
                  </p>
                  <Link href={backPath(load.subject)} className="sb-btn sb-btn--primary w-full">
                    {load.subject.kind === "order" ? "Ver mi orden" : "Ver mi encargo"}
                  </Link>
                </>
              ) : declined || load.payment.status === "DECLINED" ? (
                <>
                  <p className="text-danger body flex items-start gap-2" role="alert">
                    <XCircle className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                    Tu pago fue rechazado. No se hizo ningún cobro{load.subject.kind === "order" ? " y tus productos siguen reservados" : ""}.
                  </p>
                  <Button onClick={retry} loading={busy === "retry"} className="w-full">
                    Intentar de nuevo
                  </Button>
                  <Link href={backPath(load.subject)} className="sb-btn sb-btn--secondary w-full">
                    {load.subject.kind === "order" ? "Volver a mi orden" : "Volver a mi encargo"}
                  </Link>
                </>
              ) : (
                <>
                  {left !== null && load.subject.kind === "order" && load.subject.pendingOrder && (
                    <p className={`body-sm flex items-center gap-1.5 ${left === 0 ? "text-danger" : left < 300 ? "text-danger" : "text-ink-muted"}`} aria-live="off">
                      <AlertCircle className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                      {left === 0 ? "Tu reserva venció. Si pagas ahora, la API puede rechazar el pago." : `Tu reserva vence en ${formatClock(left)}.`}
                    </p>
                  )}
                  <p className="body-sm text-ink-muted">
                    Esta es una pantalla de pruebas: no se hace ningún cobro. Elige qué resultado quieres simular.
                  </p>
                  <div className="space-y-3">
                    <Button onClick={() => resolve("approved")} loading={busy === "approved"} disabled={busy !== null} className="w-full">
                      Simular pago aprobado
                    </Button>
                    <Button variant="secondary" onClick={() => resolve("declined")} loading={busy === "declined"} disabled={busy !== null} className="w-full">
                      Simular pago rechazado
                    </Button>
                  </div>
                  <Link href={backPath(load.subject, "?pago=pendiente")} className="body-sm text-ink-muted hover:text-ink block text-center underline underline-offset-4">
                    Pagar después
                  </Link>
                </>
              )}

              {notice && (
                <p role="alert" className="body-sm text-danger flex items-start gap-1.5">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                  {notice}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
