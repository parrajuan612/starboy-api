"use client";

import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

/** Input con etiqueta, ayuda y error asociados por ARIA. El error se anuncia y marca el campo como inválido. */
export function Field({ label, name, error, hint, type = "text", required, id, ...props }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={inputId} className="sb-label">
        {label}
        {!required && <span className="text-ink-muted normal-case tracking-normal"> (opcional)</span>}
      </label>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          type={isPassword && visible ? "text" : type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`sb-input ${isPassword ? "pr-12" : ""}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={visible}
            className="text-ink-muted hover:text-ink absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center"
          >
            {visible ? <EyeOff className="size-5" strokeWidth={1.5} aria-hidden /> : <Eye className="size-5" strokeWidth={1.5} aria-hidden />}
          </button>
        )}
      </div>
      {error && (
        <p id={errId} className="sb-field-error">
          <AlertCircle className="mt-px size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="sb-field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

interface ShellProps {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  id?: string;
}

function useIds(id?: string) {
  const auto = useId();
  const base = id ?? auto;
  return { base, err: `${base}-error`, hint: `${base}-hint` };
}

function Messages({ ids, error, hint }: { ids: { err: string; hint: string }; error?: string; hint?: string }) {
  return (
    <>
      {error && (
        <p id={ids.err} className="sb-field-error">
          <AlertCircle className="mt-px size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={ids.hint} className="sb-field-hint">
          {hint}
        </p>
      )}
    </>
  );
}

/** Lista desplegable con la misma etiqueta, ayuda y error que `Field`. */
export function SelectField({ label, name, error, hint, required, id, children, ...props }: ShellProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const ids = useIds(id);
  return (
    <div>
      <label htmlFor={ids.base} className="sb-label">
        {label}
        {!required && <span className="text-ink-muted normal-case tracking-normal"> (opcional)</span>}
      </label>
      <select
        id={ids.base}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? ids.err : null, hint ? ids.hint : null].filter(Boolean).join(" ") || undefined}
        className="sb-input"
        {...props}
      >
        {children}
      </select>
      <Messages ids={ids} error={error} hint={hint} />
    </div>
  );
}

/** Área de texto con la misma etiqueta, ayuda y error que `Field`. */
export function TextAreaField({ label, name, error, hint, required, id, ...props }: ShellProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ids = useIds(id);
  return (
    <div>
      <label htmlFor={ids.base} className="sb-label">
        {label}
        {!required && <span className="text-ink-muted normal-case tracking-normal"> (opcional)</span>}
      </label>
      <textarea
        id={ids.base}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? ids.err : null, hint ? ids.hint : null].filter(Boolean).join(" ") || undefined}
        className="sb-input min-h-24 py-3"
        {...props}
      />
      <Messages ids={ids} error={error} hint={hint} />
    </div>
  );
}
