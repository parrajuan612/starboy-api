"use client";

import { Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { EmptyCart } from "@/components/cart/EmptyCart";
import { useCartView } from "@/components/cart/useCartView";
import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { Alert, Button, Field, SelectField, TextAreaField } from "@/components/ui";
import { listAddresses } from "@/lib/account";
import { isApiError } from "@/lib/api-client";
import { attemptKey, clearAttempt, clearDraft, loadDraft, saveDraft } from "@/lib/checkout-draft";
import { DEPARTMENTS } from "@/lib/colombia";
import { focusFirstInvalid, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { confirmationPath, createOrder, createPayment } from "@/lib/orders";
import { goToPayment } from "@/lib/payment-redirect";
import { checkoutSchema, EMPTY_CHECKOUT, type CheckoutForm } from "@/lib/validators/checkout";
import { useAuthStore } from "@/store/auth";
import { useCartStore } from "@/store/cart";
import type { Address, User } from "@/types";

import { CheckoutSummary } from "./CheckoutSummary";

type Values = CheckoutForm;
const FIELDS: string[] = Object.keys(EMPTY_CHECKOUT);

/** Datos de la cuenta como punto de partida; lo que la persona ya escribió (borrador) tiene prioridad. */
function initialValues(user: User): Values {
  const parts = user.full_name.trim().split(/\s+/);
  const cut = Math.ceil(parts.length / 2);
  return {
    ...EMPTY_CHECKOUT,
    first_name: parts.slice(0, cut).join(" "),
    last_name: parts.slice(cut).join(" "),
    phone: user.phone ?? "",
    document_id: user.document_id ?? "",
    ...loadDraft(),
  };
}

/** Copia una dirección guardada a los campos de envío; no toca los datos de contacto. */
function applyAddress(v: Values, a: Address): Values {
  return { ...v, department: a.department, city: a.city, line1: a.line1, line2: a.line2 ?? "", notes: a.notes ?? "" };
}

const addressLabel = (a: Address) => `${a.label ? `${a.label} · ` : ""}${a.line1}, ${a.city}${a.is_default ? " (predeterminada)" : ""}`;

interface StockIssue {
  variantId: string;
  name: string;
  size: string;
  available: number;
}

/** Lo que la API dice que falló al crear la orden, traducido a algo que la persona pueda resolver. */
interface Problem {
  fields: FieldErrors;
  message: string | null;
  stock: StockIssue[];
  unavailable: { variantId: string; name: string; size: string }[];
}

const NO_PROBLEM: Problem = { fields: {}, message: null, stock: [], unavailable: [] };

export function CheckoutPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user)!;
  const { lines, checks, subtotal, units, blockingCount } = useCartView(true);

  const [values, setValues] = useState<Values>(() => initialValues(user));
  const [problem, setProblem] = useState<Problem>(NO_PROBLEM);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false); // orden creada: el carrito ya se vació y estamos saliendo
  const formRef = useRef<HTMLFormElement>(null);
  const lock = useRef(false); // un solo envío a la vez, aunque el botón se pulse dos veces seguidas

  useEffect(() => {
    saveDraft(values);
  }, [values]);

  // Direcciones guardadas en la cuenta. La predeterminada llena el formulario solo si la persona
  // aún no escribió una dirección (el borrador tiene prioridad). Si falla, se sigue a mano.
  const [saved, setSaved] = useState<Address[]>([]);
  const [chosen, setChosen] = useState("");
  useEffect(() => {
    let alive = true;
    listAddresses()
      .then((list) => {
        if (!alive || list.length === 0) return;
        setSaved(list);
        const def = list.find((a) => a.is_default);
        if (def && !loadDraft().line1) {
          setChosen(def.id);
          setValues((v) => applyAddress(v, def));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function pickAddress(e: React.ChangeEvent<HTMLSelectElement>) {
    const a = saved.find((x) => x.id === e.target.value);
    setChosen(e.target.value);
    if (a) setValues((v) => applyAddress(v, a));
  }

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  /** Traduce un error de la API. Si el intento terminó de forma definitiva, la siguiente vez se usa una llave nueva. */
  function explain(e: unknown): Problem {
    if (!isApiError(e)) return { ...NO_PROBLEM, message: "Algo salió mal. Inténtalo de nuevo." };
    const d = e.details ?? {};

    if (e.code === "INSUFFICIENT_STOCK") {
      clearAttempt();
      const stock: StockIssue[] = [];
      for (const v of Object.values(d)) {
        const x = v as { variant_id?: string; available?: number };
        const line = lines.find((l) => l.variantId === x.variant_id);
        if (line && typeof x.available === "number") stock.push({ variantId: line.variantId, name: line.name, size: line.size, available: x.available });
      }
      return { ...NO_PROBLEM, message: e.message, stock };
    }
    if (e.code === "VARIANT_UNAVAILABLE") {
      clearAttempt();
      const unavailable = Object.keys(d)
        .map((k) => /^items\[(\d+)\]/.exec(k)?.[1])
        .filter((i): i is string => i !== undefined)
        .map((i) => lines[Number(i)])
        .filter(Boolean)
        .map((l) => ({ variantId: l.variantId, name: l.name, size: l.size }));
      return { ...NO_PROBLEM, message: e.message, unavailable };
    }
    if (e.code === "VALIDATION_ERROR") {
      clearAttempt();
      const fields: FieldErrors = {};
      let other: string | null = null;
      for (const [k, msg] of Object.entries(e.fieldErrors)) {
        const name = k.split(".").pop() === "recipient_name" ? "first_name" : (k.split(".").pop() ?? k);
        if (FIELDS.includes(name)) fields[name] = msg;
        else other ??= msg;
      }
      return { ...NO_PROBLEM, fields, message: Object.keys(fields).length ? null : (other ?? e.message) };
    }
    if (e.status === 0 || e.status >= 500) {
      // Puede que la orden sí se haya creado: la llave se conserva, así reintentar no duplica nada.
      return { ...NO_PROBLEM, message: "No pudimos confirmar tu orden. Tus datos están guardados: inténtalo de nuevo, no se cobrará dos veces." };
    }
    clearAttempt();
    return { ...NO_PROBLEM, message: e.message };
  }

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (lock.current || blockingCount > 0 || lines.length === 0) return;

    const parsed = checkoutSchema.safeParse(values);
    if (!parsed.success) {
      setProblem({ ...NO_PROBLEM, fields: zodFieldErrors(parsed.error) });
      focusFirstInvalid(formRef.current);
      return;
    }

    lock.current = true;
    setPending(true);
    setProblem(NO_PROBLEM);
    try {
      const order = await createOrder(lines, parsed.data, attemptKey(lines, parsed.data));

      // La orden existe (stock reservado): recién ahora se vacía el carrito y se descarta el borrador.
      clearAttempt();
      clearDraft();
      useCartStore.getState().clear();
      setDone(true);

      try {
        if (!goToPayment(await createPayment(order.id), router)) router.push(confirmationPath(order.id, "?pago=pendiente"));
      } catch {
        // Sin pasarela por ahora: la orden queda reservada y desde su pantalla se puede pagar.
        router.push(confirmationPath(order.id, "?pago=pendiente"));
      }
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        router.replace("/login?next=/checkout");
        return;
      }
      setProblem(explain(err));
      focusFirstInvalid(formRef.current);
      lock.current = false;
      setPending(false);
    }
  }

  function adjustCart() {
    const { setQuantity, remove } = useCartStore.getState();
    for (const s of problem.stock) {
      if (s.available > 0) setQuantity(s.variantId, s.available);
      else remove(s.variantId);
    }
    setProblem(NO_PROBLEM);
  }

  function removeUnavailable() {
    for (const u of problem.unavailable) useCartStore.getState().remove(u.variantId);
    setProblem(NO_PROBLEM);
  }

  if (done) {
    return (
      <div role="status" className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-24 text-center">
        <Loader2 className="size-8 animate-spin" strokeWidth={1.5} aria-hidden />
        <h1 className="display-md">Tu orden está creada</h1>
        <p className="body text-ink-muted">Te llevamos a la pasarela de pago…</p>
      </div>
    );
  }

  const f = problem.fields;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Carrito", href: "/carrito" }, { label: "Checkout" }]} />
      <h1 className="display-lg mt-4 mb-8">Checkout</h1>

      {lines.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-12">
          <form id="checkout-form" ref={formRef} onSubmit={onSubmit} noValidate className="space-y-10">
            <fieldset disabled={pending} className="space-y-10">
              {problem.message && (
                <div className="space-y-3">
                  <Alert>{problem.message}</Alert>
                  {problem.stock.length > 0 && (
                    <div className="border-line bg-surface-raised border p-4">
                      <ul className="body-sm mb-3 list-disc pl-5">
                        {problem.stock.map((s) => (
                          <li key={s.variantId}>
                            {s.name} (talla {s.size}): {s.available > 0 ? `solo quedan ${s.available}` : "se agotó"}
                          </li>
                        ))}
                      </ul>
                      <Button variant="secondary" onClick={adjustCart}>
                        Ajustar mi carrito
                      </Button>
                    </div>
                  )}
                  {problem.unavailable.length > 0 && (
                    <div className="border-line bg-surface-raised border p-4">
                      <ul className="body-sm mb-3 list-disc pl-5">
                        {problem.unavailable.map((u) => (
                          <li key={u.variantId}>
                            {u.name} (talla {u.size})
                          </li>
                        ))}
                      </ul>
                      <Button variant="secondary" onClick={removeUnavailable}>
                        Quitar del carrito
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <section aria-labelledby="co-contact" className="space-y-5">
                <h2 id="co-contact" className="display-sm">
                  Datos de contacto
                </h2>
                <p className="body-sm text-ink-muted">
                  Tu orden queda a nombre de <strong className="text-ink font-semibold">{user.email}</strong>.
                </p>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Nombre" name="first_name" required autoComplete="given-name" value={values.first_name} onChange={set("first_name")} error={f.first_name} />
                  <Field label="Apellidos" name="last_name" required autoComplete="family-name" value={values.last_name} onChange={set("last_name")} error={f.last_name} />
                  <Field
                    label="Cédula o documento"
                    name="document_id"
                    required
                    autoComplete="off"
                    value={values.document_id}
                    onChange={set("document_id")}
                    error={f.document_id}
                    hint="Para tu factura y la entrega. Sin puntos."
                  />
                  <Field label="Celular" name="phone" type="tel" inputMode="tel" required autoComplete="tel" value={values.phone} onChange={set("phone")} error={f.phone} hint="La transportadora te llamará a este número." />
                </div>
              </section>

              <section aria-labelledby="co-ship" className="space-y-5">
                <h2 id="co-ship" className="display-sm">
                  Dirección de envío
                </h2>
                {saved.length > 0 && (
                  <SelectField label="Direcciones guardadas" name="saved_address" value={chosen} onChange={pickAddress}>
                    <option value="">Escribir otra dirección</option>
                    {saved.map((a) => (
                      <option key={a.id} value={a.id}>
                        {addressLabel(a)}
                      </option>
                    ))}
                  </SelectField>
                )}
                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField label="Departamento" name="department" required autoComplete="address-level1" value={values.department} onChange={set("department")} error={f.department}>
                    <option value="">Elige tu departamento</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </SelectField>
                  <Field label="Ciudad o municipio" name="city" required autoComplete="address-level2" value={values.city} onChange={set("city")} error={f.city} />
                </div>
                <Field
                  label="Dirección exacta"
                  name="line1"
                  required
                  autoComplete="address-line1"
                  value={values.line1}
                  onChange={set("line1")}
                  error={f.line1}
                  hint="Calle o carrera, número y barrio. Ej.: Calle 10 # 20-30, El Poblado."
                />
                <Field label="Apartamento, torre o conjunto" name="line2" autoComplete="address-line2" value={values.line2} onChange={set("line2")} error={f.line2} />
                <TextAreaField
                  label="Notas de entrega"
                  name="notes"
                  maxLength={300}
                  value={values.notes}
                  onChange={set("notes")}
                  error={f.notes}
                  hint="Ej.: deja el paquete en portería, llamar al llegar."
                />
              </section>

              <section aria-labelledby="co-pay" className="space-y-3">
                <h2 id="co-pay" className="display-sm">
                  Pago
                </h2>
                <p className="body text-ink-muted">
                  Al confirmar creamos tu orden y reservamos tus productos por <strong className="text-ink font-semibold">30 minutos</strong>. Luego pasas a la pasarela de pago para completarla.
                </p>
              </section>
            </fieldset>
          </form>

          <CheckoutSummary lines={lines} checks={checks} subtotal={subtotal} units={units} blockingCount={blockingCount}>
            <Button type="submit" form="checkout-form" loading={pending} disabled={blockingCount > 0} className="w-full">
              {pending ? "Creando tu orden…" : "Confirmar y pagar"}
            </Button>
            <p className="caption text-ink-muted flex items-center justify-center gap-1.5">
              <Lock className="size-3.5" strokeWidth={1.5} aria-hidden />
              Tus datos viajan cifrados. Los precios los confirma nuestro servidor.
            </p>
            <Link href="/carrito" className="body-sm text-ink-muted hover:text-ink block text-center underline underline-offset-4">
              Volver al carrito
            </Link>
          </CheckoutSummary>
        </div>
      )}
    </div>
  );
}
