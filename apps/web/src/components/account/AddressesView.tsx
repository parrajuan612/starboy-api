"use client";

import { Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AddressForm } from "@/components/account/AddressForm";
import { Alert, Button } from "@/components/ui";
import { deleteAddress, listAddresses, updateAddress } from "@/lib/account";
import { ApiError } from "@/lib/api-client";
import type { Address } from "@/types";

type Mode = { kind: "list" } | { kind: "new" } | { kind: "edit"; id: string };

/** Libreta de direcciones: agregar, editar, elegir la predeterminada y eliminar (con confirmación). */
export function AddressesView() {
  const [items, setItems] = useState<Address[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await listAddresses());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No pudimos cargar tus direcciones.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos remotos
    void load();
  }, [load]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No pudimos completar la acción.");
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  if (!items && !error) {
    return (
      <p role="status" className="body text-ink-muted flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando direcciones…
      </p>
    );
  }

  const list = items ?? [];
  const editing = mode.kind === "edit" ? list.find((a) => a.id === mode.id) : undefined;

  return (
    <section aria-labelledby="addr-title" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="addr-title" className="display-sm">
          Direcciones de envío
        </h2>
        {mode.kind === "list" && list.length < 10 && (
          <Button onClick={() => setMode({ kind: "new" })}>
            <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Agregar dirección
          </Button>
        )}
      </div>

      {error && <Alert>{error}</Alert>}

      {mode.kind === "new" && (
        <AddressForm
          isFirst={list.length === 0}
          onCancel={() => setMode({ kind: "list" })}
          onSaved={() => {
            setMode({ kind: "list" });
            void load();
          }}
        />
      )}
      {mode.kind === "edit" && editing && (
        <AddressForm
          address={editing}
          isFirst={false}
          onCancel={() => setMode({ kind: "list" })}
          onSaved={() => {
            setMode({ kind: "list" });
            void load();
          }}
        />
      )}

      {list.length === 0 && mode.kind === "list" && !error && (
        <div className="border-line border border-dashed p-8 text-center">
          <MapPin className="text-ink-muted mx-auto size-8" strokeWidth={1.5} aria-hidden />
          <p className="body-strong mt-3">Aún no tienes direcciones guardadas</p>
          <p className="body-sm text-ink-muted mt-1">Guárdalas aquí y tendrás tu compra más rápida.</p>
        </div>
      )}

      <ul aria-label="Mis direcciones" className="grid gap-4 md:grid-cols-2">
        {list.map((a) => (
          <li key={a.id} className="bg-surface-raised border-line flex flex-col border p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="body-strong">{a.label || "Dirección"}</p>
              {a.is_default && <span className="sb-badge sb-badge--brand-outline">Predeterminada</span>}
            </div>
            <address className="body mt-2 space-y-0.5 not-italic">
              <p>{a.line1}</p>
              {a.line2 && <p>{a.line2}</p>}
              <p>
                {a.city}, {a.department}
              </p>
            </address>
            {a.notes && <p className="body-sm text-ink-muted mt-2">{a.notes}</p>}

            <div className="border-line mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3">
              {confirmId === a.id ? (
                <>
                  <span className="body-sm">¿Eliminar esta dirección?</span>
                  <Button variant="secondary" className="min-h-11" loading={busyId === a.id} onClick={() => run(a.id, () => deleteAddress(a.id))}>
                    Sí, eliminar
                  </Button>
                  <Button variant="secondary" className="min-h-11" onClick={() => setConfirmId(null)}>
                    No
                  </Button>
                </>
              ) : (
                <>
                  <button type="button" className="label hover:text-accent inline-flex min-h-11 items-center gap-1.5" onClick={() => setMode({ kind: "edit", id: a.id })}>
                    <Pencil className="size-4" strokeWidth={1.5} aria-hidden /> Editar
                  </button>
                  {!a.is_default && (
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      className="label hover:text-accent inline-flex min-h-11 items-center"
                      onClick={() => run(a.id, () => updateAddress(a.id, { is_default: true }))}
                    >
                      Hacer predeterminada
                    </button>
                  )}
                  <button type="button" className="label text-danger inline-flex min-h-11 items-center gap-1.5" onClick={() => setConfirmId(a.id)}>
                    <Trash2 className="size-4" strokeWidth={1.5} aria-hidden /> Eliminar
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
