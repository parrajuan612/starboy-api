"use client";

import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Alert, Button, Field, SelectField, TextAreaField } from "@/components/ui";
import { changeImportStatus, createImportQuote, getAdminImport } from "@/lib/admin";
import { ApiError } from "@/lib/api-client";
import { formatCOP, formatDate, formatUSD } from "@/lib/format";
import { IMPORT_LABEL, importBadge } from "@/lib/import-status";
import { useAuthStore } from "@/store/auth";
import type { ImportRequest, ImportStatus } from "@/types";

const message = (e: unknown, fallback: string) => {
  if (!(e instanceof ApiError)) return fallback;
  return Object.values(e.fieldErrors)[0] ?? e.message;
};

/** Solo http(s): la URL la escribió un cliente, no se enlaza cualquier cosa. */
const safeHref = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined);

export function ImportDetailPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const role = useAuthStore((s) => s.user?.role);
  const [req, setReq] = useState<ImportRequest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setReq(await getAdminImport(id));
    } catch (e) {
      setLoadError(message(e, "No pudimos cargar el encargo."));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de datos remotos
    void reload();
  }, [reload]);

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!req) {
    return (
      <p role="status" className="body text-ink-muted flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando…
      </p>
    );
  }

  const done = async (text: string) => {
    setNotice(text);
    await reload();
    onChanged();
  };
  const canQuote = role === "ADMIN" && ["REQUESTED", "QUOTED", "EXPIRED"].includes(req.status);
  const q = req.quote;

  return (
    <div className="space-y-7">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="display-sm">{req.code}</p>
          <span className={`sb-badge ${importBadge(req.status)}`}>{IMPORT_LABEL[req.status]}</span>
        </div>
        <p className="caption text-ink-muted">Solicitada el {formatDate(req.created_at)}</p>
      </header>

      {notice && (
        <p role="status" className="border-success text-success body-sm flex items-start gap-2 border p-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          {notice}
        </p>
      )}

      {req.customer && (
        <section aria-labelledby="im-cust">
          <h3 id="im-cust" className="label mb-3">Cliente</h3>
          <dl className="body-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-ink-muted">Nombre</dt><dd>{req.customer.full_name}</dd>
            <dt className="text-ink-muted">Correo</dt><dd className="break-all">{req.customer.email}</dd>
            <dt className="text-ink-muted">Celular</dt><dd>{req.customer.phone || "—"}</dd>
            <dt className="text-ink-muted">Cédula</dt><dd>{req.customer.document_id || "—"}</dd>
          </dl>
        </section>
      )}

      <section aria-labelledby="im-items">
        <h3 id="im-items" className="label mb-3">Productos solicitados</h3>
        <ul className="divide-line border-line divide-y border-y">
          {(req.items ?? []).map((it) => (
            <li key={it.id} className="py-3">
              <p className="body-sm body-strong">{it.description} × {it.quantity}</p>
              <p className="caption text-ink-muted">
                {[it.store_name, it.size && `Talla ${it.size}`, it.color, it.declared_price_usd_cents > 0 && `Declarado ${formatUSD(it.declared_price_usd_cents)}`, it.rate_name].filter(Boolean).join(" · ")}
              </p>
              {safeHref(it.product_url) && (
                <a href={safeHref(it.product_url)} target="_blank" rel="noopener noreferrer nofollow" className="body-sm hover:text-accent mt-1 inline-flex min-h-11 items-center gap-1.5 break-all underline underline-offset-4">
                  Ver producto <ExternalLink className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
        {req.customer_notes && <p className="body-sm text-ink-muted mt-3">Nota del cliente: {req.customer_notes}</p>}
      </section>

      {q && (
        <section aria-labelledby="im-quote">
          <h3 id="im-quote" className="label mb-3">Cotización v{q.version} · {q.status === "SENT" ? (q.is_expired ? "Vencida" : "Enviada") : q.status === "ACCEPTED" ? "Aceptada" : q.status === "REJECTED" ? "Rechazada" : "Vencida"}</h3>
          <dl className="body-sm space-y-1">
            <Row k="Producto" v={formatCOP(q.product_cop)} />
            <Row k="Logística" v={formatCOP(q.logistics_cop)} />
            <Row k="Servicio" v={formatCOP(q.service_fee_cop)} />
            <Row k="Impuestos" v={q.taxes_applied ? formatCOP(q.taxes_cop) : "No aplican"} />
            <div className="border-line flex justify-between border-t pt-2"><dt className="body-strong">Total</dt><dd className="body-strong tabular-nums">{formatCOP(q.total_cop)}</dd></div>
            <Row k={`Anticipo (${q.deposit_percent} %)`} v={formatCOP(q.deposit_cop)} />
            <Row k="Saldo" v={formatCOP(q.balance_cop)} />
          </dl>
          <p className="caption text-ink-muted mt-2">Vigente hasta {formatDate(q.valid_until)}{q.balance_cod_allowed ? " · saldo contra entrega permitido" : ""}</p>
        </section>
      )}

      {req.requote_requested_at && (
        <p role="status" className="border-danger text-danger body-sm border p-3">
          El cliente pidió una nueva cotización el {formatDate(req.requote_requested_at)}. Emite una cotización nueva para atenderlo.
        </p>
      )}
      {req.status === "BALANCE_DUE" && q && (
        <p className={`body-sm border p-3 ${req.balance_paid ? "border-success text-success" : "border-line"}`}>
          {req.balance_paid
            ? `El cliente pagó el saldo de ${formatCOP(q.balance_cop)} en la web. Ya puedes despachar.`
            : q.balance_cod_allowed
              ? `Saldo de ${formatCOP(q.balance_cop)} contra entrega (permitido en la cotización).`
              : `Falta el saldo de ${formatCOP(q.balance_cop)}. No se puede despachar hasta que el cliente lo pague en la web o confirmes que lo recibiste por otro medio.`}
        </p>
      )}

      {canQuote && <QuoteForm key={`${q?.id ?? "new"}`} id={id} onDone={() => done("Cotización enviada al cliente.")} />}

      <StatusForm key={req.status} req={req} onDone={(t) => done(t)} />

      {req.history && req.history.length > 0 && (
        <section aria-labelledby="im-hist">
          <h3 id="im-hist" className="label mb-3">Historial</h3>
          <ol className="border-line ml-1.5 space-y-4 border-l pl-5">
            {[...req.history].reverse().map((h, i) => (
              <li key={h.created_at + h.status + i} className="relative">
                <span aria-hidden className={`absolute top-1.5 -left-[26px] size-2.5 rounded-full ${i === 0 ? "bg-brand" : "bg-line-strong"}`} />
                <p className="body-sm body-strong">{h.label}</p>
                {h.note && <p className="body-sm text-ink-muted">{h.note}</p>}
                <p className="caption text-ink-muted">{formatDate(h.created_at)}{h.notify_customer ? "" : " · no se avisó al cliente"}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4"><dt className="text-ink-muted">{k}</dt><dd className="tabular-nums">{v}</dd></div>
  );
}

function StatusForm({ req, onDone }: { req: ImportRequest; onDone: (t: string) => void }) {
  const next: ImportStatus[] = req.allowed_next ?? [];
  const [to, setTo] = useState<ImportStatus | "">("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [carrier, setCarrier] = useState(req.carrier_usa ?? "");
  const [trackUS, setTrackUS] = useState(req.tracking_usa ?? "");
  const [trackCO, setTrackCO] = useState(req.tracking_co ?? "");
  const [confirmBalance, setConfirmBalance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Despachar sin saldo pagado en la web exige confirmar que se recibió por otro medio (queda en el historial).
  const needsBalanceConfirm = to === "OUT_FOR_DELIVERY" && !!req.balance_blocks_dispatch;

  if (next.length === 0) {
    return (
      <section aria-labelledby="im-status">
        <h3 id="im-status" className="label mb-3">Cambiar estado</h3>
        <p className="body-sm text-ink-muted">
          {["ACCEPTED", "PAID"].includes(req.status)
            ? "El siguiente paso depende del flujo del cliente o del pago."
            : "Este encargo no tiene más cambios manuales."}
        </p>
      </section>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!to || saving) return;
    if (needsBalanceConfirm && !confirmBalance) {
      setError("Confirma que recibiste el saldo por otro medio, o espera a que el cliente pague en la web.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changeImportStatus(req.id, {
        status: to,
        note: note.trim() || undefined,
        notify_customer: notify,
        carrier_usa: carrier.trim(),
        tracking_usa: trackUS.trim(),
        tracking_co: trackCO.trim(),
        ...(needsBalanceConfirm ? { confirm_balance_received: true } : {}),
      });
      onDone(`Estado actualizado a «${IMPORT_LABEL[to]}».`);
    } catch (err) {
      setError(message(err, "No pudimos cambiar el estado."));
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="im-status">
      <h3 id="im-status" className="label mb-3">Cambiar estado</h3>
      <form onSubmit={submit} noValidate className="space-y-4">
        <SelectField label="Nuevo estado" name="status" required value={to} onChange={(e) => setTo(e.target.value as ImportStatus)}>
          <option value="">Elige…</option>
          {next.map((s) => (
            <option key={s} value={s}>{IMPORT_LABEL[s]}</option>
          ))}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Transportadora USA" name="carrier_usa" value={carrier} onChange={(e) => setCarrier(e.target.value)} maxLength={80} />
          <Field label="Guía USA" name="tracking_usa" value={trackUS} onChange={(e) => setTrackUS(e.target.value)} maxLength={120} />
        </div>
        <Field label="Guía en Colombia" name="tracking_co" value={trackCO} onChange={(e) => setTrackCO(e.target.value)} maxLength={120} />
        <TextAreaField label="Nota (la ve el cliente si se le avisa)" name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        {needsBalanceConfirm && (
          <label className="body border-danger flex items-start gap-3 border p-3">
            <input type="checkbox" checked={confirmBalance} onChange={(e) => setConfirmBalance(e.target.checked)} className="accent-brand mt-0.5 size-5 shrink-0" />
            <span>Confirmo que recibí el saldo por otro medio (transferencia o efectivo). Queda anotado en el historial.</span>
          </label>
        )}
        <label className="body flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-brand size-5" />
          Avisar al cliente
        </label>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={saving} disabled={!to}>Guardar estado</Button>
      </form>
    </section>
  );
}

function QuoteForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [deposit, setDeposit] = useState("");
  const [logistics, setLogistics] = useState("");
  const [cod, setCod] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const dep = deposit.trim() === "" ? undefined : Number(deposit);
    const log = logistics.trim() === "" ? undefined : Number(logistics.replace(/[.\s]/g, ""));
    if ((dep !== undefined && (!Number.isInteger(dep) || dep < 1 || dep > 100)) || (log !== undefined && (!Number.isInteger(log) || log < 0))) {
      setError("Revisa el anticipo (1 a 100) y la logística (pesos enteros).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createImportQuote(id, { balance_cod_allowed: cod, deposit_percent: dep, logistics_cop_override: log, notes_customer: notes.trim() || undefined });
      onDone();
    } catch (err) {
      setError(message(err, "No pudimos emitir la cotización."));
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="im-qform">
      <h3 id="im-qform" className="label mb-3">Emitir cotización</h3>
      <form onSubmit={submit} noValidate className="border-line space-y-4 border p-4">
        <p className="body-sm text-ink-muted">Los montos salen de las tarifas por categoría y de la TRM vigente. Deja vacío para usar los valores por defecto.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Anticipo (%)" name="deposit" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          <Field label="Logística (COP, opcional)" name="logistics" inputMode="numeric" value={logistics} onChange={(e) => setLogistics(e.target.value)} />
        </div>
        <label className="body flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={cod} onChange={(e) => setCod(e.target.checked)} className="accent-brand size-5" />
          Permitir saldo contra entrega (exige anticipo de al menos 50 %)
        </label>
        <TextAreaField label="Nota para el cliente" name="notes_customer" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={saving}>Enviar cotización</Button>
      </form>
    </section>
  );
}
