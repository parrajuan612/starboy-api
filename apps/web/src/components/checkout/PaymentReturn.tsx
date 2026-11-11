"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert, Button } from "@/components/ui";
import { isApiError } from "@/lib/api-client";
import { createImportPayment, importPath } from "@/lib/imports";
import { confirmationPath, createPayment, getPayment } from "@/lib/orders";
import { goToPayment } from "@/lib/payment-redirect";
import type { Payment } from "@/types";

const POLL_MS = 3000;
const MAX_POLLS = 10; // ≈ 30 s: el webhook de la pasarela suele llegar antes

/** A dónde vuelve la persona según lo que pagó. */
const destination = (p: Payment, qs = "") => (p.order_id ? confirmationPath(p.order_id, qs) : p.import_request_id ? importPath(p.import_request_id, qs) : "/cuenta");

/**
 * Página a la que la pasarela (cualquiera) devuelve al cliente: `/pago/retorno?pid=<id del pago>`.
 * No confía en nada que venga en la URL salvo el id: el estado real lo confirma el webhook de la pasarela, así que
 * aquí se consulta el pago a la API y se espera unos segundos a que pase de «pendiente» a su resultado.
 */
export function PaymentReturn() {
  const router = useRouter();
  const pid = useSearchParams().get("pid");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(pid ? null : "El enlace de retorno está incompleto. Revisa tu cuenta para ver el estado de tu pago.");
  const [timedOut, setTimedOut] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pid) return;
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const p = await getPayment(pid);
        if (!alive) return;
        setPayment(p);
        if (p.status === "APPROVED") {
          router.replace(destination(p, "?pago=aprobado"));
          return;
        }
        if (p.status === "PENDING") {
          if (++tries >= MAX_POLLS) setTimedOut(true);
          else timer = setTimeout(tick, POLL_MS);
        }
      } catch (e) {
        if (alive) setError(isApiError(e) && e.status === 404 ? "No encontramos ese pago en tu cuenta." : "No pudimos consultar tu pago. Revisa tu cuenta en unos minutos.");
      }
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [pid, router]);

  async function retry() {
    if (!payment || busy) return;
    setBusy(true);
    try {
      const next = payment.order_id ? await createPayment(payment.order_id) : await createImportPayment(payment.import_request_id!);
      if (!goToPayment(next, router)) setError("No pudimos abrir un nuevo intento de pago. Inténtalo desde tu cuenta.");
    } catch (e) {
      setError(isApiError(e) ? e.message : "No pudimos abrir un nuevo intento de pago.");
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 md:py-16">
      <div className="bg-surface-raised border-line space-y-5 border p-6">
        <h1 className="display-sm">Tu pago</h1>

        {error && (
          <>
            <Alert>{error}</Alert>
            <Link href="/cuenta" className="sb-btn sb-btn--secondary w-full">
              Ir a mi cuenta
            </Link>
          </>
        )}

        {!error && (!payment || (payment.status === "PENDING" && !timedOut)) && (
          <p role="status" className="body text-ink-muted flex items-center gap-2">
            <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden />
            Estamos confirmando tu pago…
          </p>
        )}

        {!error && payment?.status === "PENDING" && timedOut && (
          <>
            <p className="body">Aún no recibimos la confirmación de tu pago. A veces tarda unos minutos: no vuelvas a pagar. Te avisaremos en tu cuenta apenas llegue.</p>
            <Link href={destination(payment, "?pago=pendiente")} className="sb-btn sb-btn--primary w-full">
              Ver el estado
            </Link>
          </>
        )}

        {!error && payment?.status === "APPROVED" && (
          <p role="status" className="text-success body flex items-center gap-2">
            <CheckCircle2 className="size-5" strokeWidth={1.5} aria-hidden /> Pago aprobado. Te llevamos a tu compra…
          </p>
        )}

        {!error && payment?.status === "IN_REVIEW" && (
          <>
            <p className="body">Recibimos tu pago, pero lo estamos revisando. Te avisaremos cuando quede confirmado. No necesitas volver a pagar.</p>
            <Link href={destination(payment)} className="sb-btn sb-btn--primary w-full">
              Ver el estado
            </Link>
          </>
        )}

        {!error && payment?.status === "DECLINED" && (
          <>
            <p role="alert" className="text-danger body flex items-start gap-2">
              <XCircle className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
              Tu pago fue rechazado. No se hizo ningún cobro.
            </p>
            <Button onClick={retry} loading={busy} className="w-full">
              Intentar de nuevo
            </Button>
            <Link href={destination(payment)} className="sb-btn sb-btn--secondary w-full">
              Volver
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
