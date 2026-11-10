"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert, Button, Field } from "@/components/ui";
import { login, safeNext } from "@/lib/auth";
import { apiFormErrors, focusFirstInvalid, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { loginSchema } from "@/lib/validators/auth";
import { useAuthStore } from "@/store/auth";

const FIELDS = ["email", "password"] as const;

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const target = safeNext(next);
  const status = useAuthStore((s) => s.status);
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Con sesión (recién iniciada o restaurada) no hay nada que hacer aquí.
  useEffect(() => {
    if (status === "authenticated") router.replace(target);
  }, [status, target, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const raw = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = loginSchema.safeParse(raw);
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
      await login(parsed.data);
    } catch (err) {
      const r = apiFormErrors(err, FIELDS);
      setErrors(r.fieldErrors);
      setFormError(r.formError);
      focusFirstInvalid(formRef.current);
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert>{formError}</Alert>}
      <Field label="Correo" name="email" type="email" autoComplete="email" inputMode="email" required error={errors.email} />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required error={errors.password} />
      <Button type="submit" loading={pending} className="w-full">
        Ingresar
      </Button>
      <p className="body-sm text-ink-muted text-center">
        ¿Aún no tienes cuenta?{" "}
        <Link href={target === "/" ? "/registro" : `/registro?next=${encodeURIComponent(target)}`} className="text-ink underline underline-offset-4">
          Crea una
        </Link>
      </p>
    </form>
  );
}
