"use client";

import { CheckCircle2 } from "lucide-react";
import { useRef, useState } from "react";

import { Alert, Button, Field } from "@/components/ui";
import { updateProfile } from "@/lib/account";
import { apiFormErrors, focusFirstInvalid, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { profileSchema, type ProfileForm as Values } from "@/lib/validators/account";
import { useAuthStore } from "@/store/auth";

const FIELDS = ["full_name", "phone", "document_id"] as const;

/** Datos personales. La cédula queda guardada para precargar el checkout y los encargos (aduanas la exige). */
export function ProfileForm() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Values>({
    full_name: user?.full_name ?? "",
    phone: user?.phone ?? "",
    document_id: user?.document_id ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user) return null;
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setSaved(false);
    setErrors((er) => (er[k] ? { ...er, [k]: "" } : er));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    setSaved(false);
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const updated = await updateProfile(parsed.data);
      setUser(updated);
      setValues({ full_name: updated.full_name, phone: updated.phone ?? "", document_id: updated.document_id ?? "" });
      setSaved(true);
    } catch (err) {
      const r = apiFormErrors(err, FIELDS);
      setErrors(r.fieldErrors);
      setFormError(r.formError);
      focusFirstInvalid(formRef.current);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="max-w-xl space-y-5" aria-labelledby="profile-title">
      <h2 id="profile-title" className="display-sm">
        Datos personales
      </h2>
      {formError && <Alert>{formError}</Alert>}
      <Field label="Nombre completo" name="full_name" required autoComplete="name" value={values.full_name} onChange={set("full_name")} error={errors.full_name} />
      <Field label="Correo" name="email" type="email" value={user.email} disabled readOnly hint="Es tu usuario para entrar. Si necesitas cambiarlo, escríbenos." />
      <Field
        label="Celular"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="300 123 4567"
        value={values.phone}
        onChange={set("phone")}
        error={errors.phone}
      />
      <Field
        label="Cédula o documento"
        name="document_id"
        autoComplete="off"
        value={values.document_id}
        onChange={set("document_id")}
        error={errors.document_id}
        hint="Se usa para tus compras y encargos (la aduana lo exige). Puedes escribirla con puntos."
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={saving}>
          Guardar cambios
        </Button>
        {saved && (
          <p role="status" className="body-sm text-success flex items-center gap-2">
            <CheckCircle2 className="size-5" strokeWidth={1.5} aria-hidden />
            Datos guardados.
          </p>
        )}
      </div>
    </form>
  );
}
