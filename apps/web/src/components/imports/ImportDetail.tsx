"use client";

import { AlertCircle, CheckCircle2, Loader2, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ImportTimeline } from "@/components/imports/ImportTimeline";
import { Alert, Button, ButtonLink } from "@/components/ui";
import { useCountdown } from "@/hooks/useCountdown";
import { ApiError, isApiError } from "@/lib/api-client";
import { formatCOP, formatDate, formatUSD } from "@/lib/format";
import { importBadge } from "@/lib/import-status";
import { acceptQuote, createImportPayment, getMyImport, requestRequote } from "@/lib/imports";
import { goToPayment } from "@/lib/payment-redirect";
import type { ImportQuote, ImportRequest } from "@/types";

/** «1 d 4 h», «3 h 12 min», «8 min»: cuánto le queda a la cotización. */
export function formatRemaining(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${Math.max(m, 1)} min`;
}

/** Seguimiento de un encargo: estado, cotización (aceptar y pagar el anticipo), productos, guías e historial. */
export function ImportDetail({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [imp, setImp] = useState<ImportRequest | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMyImport(id)
      .then((o) => alive && setImp(o))
      .catch((e) => alive && setError(e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "No pudimos cargar el encargo.")));
    return () => {
      alive = false;
    };
  }, [id]);

  const quote = imp?.quote;
  const left = useCountdown(quote && imp?.status === "QUOTED" && quote.status === "SENT" ? quote.valid_until : undefined);

  async function pay(request: ImportRequest) {
    // Qué se cobra (anticipo o saldo) lo decide el servidor según el estado del encargo.
    const p = await createImportPayment(request.id);
    if (!goToPayment(p, router)) setActionError("No pudimos abrir el pago. Inténtalo de nuevo en un momento.");
  }

  async function accept(q: ImportQuote) {
    if (!imp || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const accepted = await acceptQuote(imp.id, q.id);
      setImp(accepted); // ya quedó ACCEPTED: si el pago falla, el botón «Pagar anticipo» sigue disponible
      await pay(accepted);
    } catch (e) {
      setActionError(isApiError(e) ? e.message : "No pudimos procesar tu solicitud. Inténtalo de nuevo.");
      getMyImport(imp.id).then(setImp).catch(() => {});
    }
    setBusy(false);
  }

  async function payOnly() {
    if (!imp || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await pay(imp);
    } catch (e) {
      setActionError(isApiError(e) ? e.message : "No pudimos abrir el pago. Inténtalo de nuevo.");
    }
    setBusy(false);
  }

  async function requote() {
    if (!imp || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      setImp(await requestRequote(imp.id));
    } catch (e) {
      setActionError(isApiError(e) ? e.message : "No pudimos enviar tu petición. Inténtalo de nuevo.");
      getMyImport(imp.id).then(setImp).catch(() => {});
    }
    setBusy(false);
  }

  if (error) {
    return (
      <div className="max-w-xl space-y-4">
        <Alert>{error.status === 404 ? "No encontramos ese encargo en tu cuenta." : error.message}</Alert>
        <ButtonLink href="/cuenta/encargos" variant="secondary">
          Volver a mis encargos
        </ButtonLink>
      </div>
    );
  }
  if (!imp) {
    return (
      <p role="status" className="body text-ink-muted flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando el encargo…
      </p>
    );
  }

  const offer = quote && imp.status === "QUOTED" && quote.status === "SENT" && !quote.is_expired && left !== 0;
  const expired = imp.status === "EXPIRED" || (imp.status === "QUOTED" && quote && (quote.is_expired || left === 0));
  const notes = (imp.history ?? []).filter((h) => h.note && h.notify_customer && h.status !== "REQUESTED"); // la nota de «solicitada» ya la dice el aviso de arriba
  const justCreated = params.get("nuevo") === "1";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/cuenta/encargos" className="body-sm text-ink-muted hover:text-ink underline-offset-4 hover:underline">
          ← Mis encargos
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="display-sm">Encargo {imp.code}</h2>
          <span className={`sb-badge ${importBadge(imp.status)}`}>{imp.status_label}</span>
        </div>
        <p className="caption text-ink-muted">Solicitado el {formatDate(imp.created_at)}</p>
      </div>

      {justCreated && (
        <p role="status" className="text-success body flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          Recibimos tu solicitud. Te responderemos con una cotización formal; la verás aquí.
        </p>
      )}
      {actionError && <Alert>{actionError}</Alert>}

      {quote && (
        <section aria-labelledby="im-quote" className="bg-surface-raised border-line border p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="im-quote" className="label">
              Cotización{quote.version > 1 ? ` (versión ${quote.version})` : ""}
            </h3>
            {offer && left !== null && (
              <p className={`body-sm flex items-center gap-1.5 ${left < 6 * 3600 ? "text-danger" : "text-ink-muted"}`}>
                <AlertCircle className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                Vence en {formatRemaining(left)}
              </p>
            )}
          </div>
          <dl className="body mt-4 space-y-2">
            <Row label="Producto" value={formatCOP(quote.product_cop)} />
            <Row label="Envío internacional y logística" value={formatCOP(quote.logistics_cop)} />
            <Row label="Comisión de servicio" value={formatCOP(quote.service_fee_cop)} />
            {quote.taxes_applied && <Row label="Impuestos" value={formatCOP(quote.taxes_cop)} />}
            <div className="border-line flex items-baseline justify-between gap-4 border-t pt-3">
              <dt className="body-strong">Total</dt>
              <dd className="price-lg tabular-nums">{formatCOP(quote.total_cop)}</dd>
            </div>
          </dl>
          <dl className="body bg-surface mt-4 space-y-2 p-4">
            <Row label={`Anticipo (${quote.deposit_percent} %)`} value={formatCOP(quote.deposit_cop)} strong />
            <Row label="Saldo al llegar a Colombia" value={formatCOP(quote.balance_cop)} />
          </dl>
          {quote.notes_customer && <p className="body-sm text-ink-muted mt-4">{quote.notes_customer}</p>}
          <p className="caption text-ink-muted mt-3">Válida hasta el {formatDate(quote.valid_until)}</p>

          {offer && (
            <div className="mt-5 space-y-2">
              <Button onClick={() => accept(quote)} loading={busy} className="w-full sm:w-auto">
                Aceptar y pagar anticipo de {formatCOP(quote.deposit_cop)}
              </Button>
              <p className="caption text-ink-muted">Al aceptar, tu cotización queda reservada y pasas al pago del anticipo.</p>
            </div>
          )}
          {imp.status === "ACCEPTED" && (
            <div className="mt-5 space-y-2">
              <p className="body-sm text-ink-muted">Aceptaste esta cotización. Falta pagar el anticipo para que compremos tu producto.</p>
              <Button onClick={payOnly} loading={busy} className="w-full sm:w-auto">
                Pagar anticipo de {formatCOP(quote.deposit_cop)}
              </Button>
            </div>
          )}
          {expired && (
            <div className="mt-5 space-y-3">
              <p className="body text-danger">Esta cotización venció.</p>
              {imp.requote_requested_at ? (
                <p role="status" className="body-sm text-ink-muted">
                  Pediste una nueva cotización el {formatDate(imp.requote_requested_at)}. Te la enviaremos con los precios al día.
                </p>
              ) : (
                <>
                  <p className="body-sm text-ink-muted">Pídenos una nueva y te la preparamos con los precios al día. No tiene costo.</p>
                  <Button onClick={requote} loading={busy} variant="secondary" className="w-full sm:w-auto">
                    Pedir una nueva cotización
                  </Button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {imp.status === "REQUESTED" && <p className="body text-ink-muted">Estamos revisando tu solicitud. Te avisaremos cuando tu cotización esté lista.</p>}
      {imp.status === "BALANCE_DUE" && quote && (
        <section aria-labelledby="im-balance" className="bg-surface-raised border-brand border-2 p-5">
          <h3 id="im-balance" className="label">
            Saldo
          </h3>
          {imp.balance_paid ? (
            <p role="status" className="text-success body mt-3 flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
              Recibimos tu saldo de {formatCOP(quote.balance_cop)}. Estamos preparando el despacho de tu encargo.
            </p>
          ) : quote.balance_cod_allowed ? (
            <p className="body mt-3">
              Tu encargo ya está en Colombia. El saldo de <span className="body-strong">{formatCOP(quote.balance_cop)}</span> lo pagas contra entrega, como acordamos.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="body">
                ¡Tu encargo ya está en Colombia! Para despacharlo, paga el saldo de <span className="body-strong">{formatCOP(quote.balance_cop)}</span>.
              </p>
              <Button onClick={payOnly} loading={busy} className="w-full sm:w-auto">
                Pagar saldo de {formatCOP(quote.balance_cop)}
              </Button>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="im-track" className="bg-surface-raised border-line border p-5">
        <h3 id="im-track" className="label mb-4">
          Seguimiento
        </h3>
        <ImportTimeline status={imp.status} history={imp.history} />
        {(imp.carrier_usa || imp.tracking_usa || imp.tracking_co) && (
          <div className="body border-line mt-5 space-y-2 border-t pt-4">
            {(imp.carrier_usa || imp.tracking_usa) && (
              <p className="flex items-start gap-2">
                <Truck className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                <span>
                  Envío desde EE. UU.: {imp.carrier_usa && <span className="body-strong">{imp.carrier_usa}</span>}
                  {imp.tracking_usa && <> · guía <span className="body-strong">{imp.tracking_usa}</span></>}
                </span>
              </p>
            )}
            {imp.tracking_co && (
              <p className="flex items-start gap-2">
                <Truck className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                <span>
                  Envío en Colombia: guía <span className="body-strong">{imp.tracking_co}</span>
                </span>
              </p>
            )}
          </div>
        )}
        {(imp.eta || imp.weight_lb > 0) && (
          <p className="body-sm text-ink-muted border-line mt-4 border-t pt-4">
            {imp.eta && <>Llegada estimada: <span className="text-ink font-semibold">{formatDate(imp.eta)}</span>. </>}
            {imp.weight_lb > 0 && <>Peso registrado: {imp.weight_lb} lb.</>}
          </p>
        )}
        {notes.length > 0 && (
          <ul aria-label="Mensajes del equipo" className="border-line mt-4 space-y-3 border-t pt-4">
            {[...notes].reverse().map((h, i) => (
              <li key={i} className="body-sm">
                <span className="text-ink-muted">{formatDate(h.created_at)} · {h.label}</span>
                <p>{h.note}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="im-items">
        <h3 id="im-items" className="label mb-3">
          Productos ({imp.item_count})
        </h3>
        <ul aria-label="Productos del encargo" className="divide-line border-line divide-y border-y">
          {(imp.items ?? []).map((i) => (
            <li key={i.id} className="py-3">
              <p className="body-strong">{i.description}</p>
              <p className="body-sm text-ink-muted">
                {[i.size && `Talla ${i.size}`, i.color, `${i.quantity} × ${formatUSD(i.declared_price_usd_cents)}`, i.rate_name].filter(Boolean).join(" · ")}
              </p>
              <a href={i.product_url} target="_blank" rel="noopener noreferrer nofollow" className="body-sm text-accent break-all underline underline-offset-4">
                {i.store_name || "Ver el producto"}
              </a>
            </li>
          ))}
        </ul>
        {imp.customer_notes && <p className="body-sm text-ink-muted mt-3">Tus notas: {imp.customer_notes}</p>}
      </section>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? "body-strong" : "text-ink-muted"}>{label}</dt>
      <dd className={`shrink-0 tabular-nums ${strong ? "body-strong" : ""}`}>{value}</dd>
    </div>
  );
}
