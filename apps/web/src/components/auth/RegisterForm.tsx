"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert, Button, Field } from "@/components/ui";
import { register, safeNext } from "@/lib/auth";
import { apiFormErrors, focusFirstInvalid, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { registerSchema } from "@/lib/validators/auth";
import { useAuthStore } from "@/store/auth";

const FIELDS = ["full_name", "email", "password", "phone", "document_id"] as const;

export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter();
  const target = safeNext(next);
  const status = useAuthStore((s) => s.status);
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace(target);
  }, [status, target, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const raw = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      setFormError(null);
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      // Los opcionales vacíos no se envían.
      const { phone, document_id, ...rest } = parsed.data;
      await register({ ...rest, ...(phone ? { phone } : {}), ...(document_id ? { document_id } : {}) });
    } catch (err) {
      const r = apiFormErrors(err, FIELDS, { EMAIL_TAKEN: "email" });
      setErrors(r.fieldErrors);
      setFormError(r.formError);
      focusFirstInvalid(formRef.current);
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert>{formError}</Alert>}
      <Field label="Nombre completo" name="full_name" autoComplete="name" required error={errors.full_name} />
      <Field label="Correo" name="email" type="email" autoComplete="email" inputMode="email" required error={errors.email} />
      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Mínimo 8 caracteres."
        error={errors.password}
      />
      <Field label="Celular" name="phone" type="tel" autoComplete="tel" inputMode="tel" error={errors.phone} />
      <Field
        label="Cédula"
        name="document_id"
        inputMode="numeric"
        hint="La necesitamos para tus encargos desde USA (aduanas)."
        error={errors.document_id}
      />
      <Button type="submit" loading={pending} className="w-full">
        Crear cuenta
      </Button>
      <p className="body-sm text-ink-muted text-center">
        ¿Ya tienes cuenta?{" "}
        <Link href={target === "/" ? "/login" : `/login?next=${encodeURIComponent(target)}`} className="text-ink underline underline-offset-4">
          Ingresa
        </Link>
      </p>
    </form>
  );
}
