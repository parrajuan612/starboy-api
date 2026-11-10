"use client";

import { useRef, useState } from "react";

import { Alert, Button, Field, SelectField, TextAreaField } from "@/components/ui";
import { createAddress, updateAddress } from "@/lib/account";
import { DEPARTMENTS } from "@/lib/colombia";
import { apiFormErrors, focusFirstInvalid, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { addressSchema, EMPTY_ADDRESS, type AddressForm as Values } from "@/lib/validators/account";
import type { Address } from "@/types";

const FIELDS = ["label", "department", "city", "line1", "line2", "notes"] as const;

interface Props {
  /** Si viene, se edita; si no, se crea. */
  address?: Address;
  /** La primera dirección siempre queda predeterminada. */
  isFirst: boolean;
  onSaved: (a: Address) => void;
  onCancel: () => void;
}

export function AddressForm({ address, isFirst, onSaved, onCancel }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Values>(
    address
      ? { label: address.label ?? "", department: address.department, city: address.city, line1: address.line1, line2: address.line2 ?? "", notes: address.notes ?? "" }
      : EMPTY_ADDRESS,
  );
  const [makeDefault, setMakeDefault] = useState(address?.is_default ?? isFirst);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setErrors((er) => (er[k] ? { ...er, [k]: "" } : er));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const parsed = addressSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    setSaving(true);
    const d = parsed.data;
    const body = { label: d.label ?? "", department: d.department, city: d.city, line1: d.line1, line2: d.line2 ?? "", notes: d.notes ?? "" };
    try {
      const saved = address
        ? await updateAddress(address.id, { ...body, ...(makeDefault && !address.is_default ? { is_default: true } : {}) })
        : await createAddress({ ...body, is_default: makeDefault });
      onSaved(saved);
    } catch (err) {
      const r = apiFormErrors(err, FIELDS);
      setErrors(r.fieldErrors);
      setFormError(r.formError);
      focusFirstInvalid(formRef.current);
    } finally {
      setSaving(false);
    }
  }

  const alreadyDefault = address?.is_default ?? false;
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="bg-surface-raised border-line space-y-4 border p-5" aria-label={address ? "Editar dirección" : "Nueva dirección"}>
      <h2 className="display-sm">{address ? "Editar dirección" : "Nueva dirección"}</h2>
      {formError && <Alert>{formError}</Alert>}
      <Field label="Nombre de la dirección" name="label" placeholder="Casa, Oficina…" value={values.label} onChange={set("label")} error={errors.label} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Departamento" name="department" required autoComplete="address-level1" value={values.department} onChange={set("department")} error={errors.department}>
          <option value="">Elige…</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </SelectField>
        <Field label="Ciudad o municipio" name="city" required autoComplete="address-level2" value={values.city} onChange={set("city")} error={errors.city} />
      </div>
      <Field label="Dirección exacta" name="line1" required autoComplete="address-line1" placeholder="Calle 10 # 20-30" value={values.line1} onChange={set("line1")} error={errors.line1} />
      <Field label="Apartamento, torre, barrio" name="line2" autoComplete="address-line2" value={values.line2} onChange={set("line2")} error={errors.line2} />
      <TextAreaField label="Indicaciones de entrega" name="notes" value={values.notes} onChange={set("notes")} error={errors.notes} />
      <label className="body flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={makeDefault}
          disabled={alreadyDefault || isFirst}
          onChange={(e) => setMakeDefault(e.target.checked)}
          className="accent-brand size-5"
        />
        {alreadyDefault || isFirst ? "Será tu dirección predeterminada" : "Usar como dirección predeterminada"}
      </label>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={saving}>
          {address ? "Guardar cambios" : "Guardar dirección"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
