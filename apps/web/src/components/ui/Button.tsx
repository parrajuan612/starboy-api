import { Loader2 } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

type Variant = "primary" | "secondary";

const base = (variant: Variant, className?: string) =>
  ["sb-btn", variant === "primary" ? "sb-btn--primary" : "sb-btn--secondary", className].filter(Boolean).join(" ");

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean };

/** `brand` es el único relleno de acciones (manual de marca §12.3). */
export function Button({ variant = "primary", loading = false, className, type = "button", children, disabled, ...props }: ButtonProps) {
  return (
    <button type={type} className={base(variant, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden />}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant };

export function ButtonLink({ variant = "primary", className, ...props }: ButtonLinkProps) {
  return <Link className={base(variant, className)} {...props} />;
}
