import { Banknote, CreditCard, Landmark } from "lucide-react";
import Link from "next/link";

import { InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui";
import { FOOTER_COLUMNS, PAYMENT_METHODS, SOCIALS, TAGLINE } from "@/lib/site";

const SOCIAL_ICONS = { instagram: InstagramIcon, tiktok: TikTokIcon, whatsapp: WhatsAppIcon };
const PAY_ICONS = [CreditCard, Landmark, Banknote];

/** Footer en tema Editorial (§12.8): logo + lema, columnas TIENDA / INFORMACIÓN / AYUDA, medios de pago, redes y copyright. */
export function Footer() {
  return (
    <footer className="theme-editorial bg-surface text-ink border-line border-t">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-4">
            <Logo />
            <p className="body-sm text-ink-muted max-w-xs">{TAGLINE}</p>
            <ul className="flex items-center gap-1 pt-2" aria-label="Redes sociales">
              {SOCIALS.map((s) => {
                const Icon = SOCIAL_ICONS[s.key];
                return (
                  <li key={s.key}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${s.label} de Starboy (se abre en otra pestaña)`}
                      className="hover:text-accent inline-flex size-11 items-center justify-center"
                    >
                      <Icon className="size-6" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="label mb-4">{col.title}</h2>
              <ul className="space-y-1">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="body-sm text-ink-muted hover:text-ink inline-flex min-h-8 items-center">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-line mt-12 flex flex-col gap-6 border-t pt-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="label mb-3">Medios de pago</h2>
            <ul className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m, i) => {
                const Icon = PAY_ICONS[i];
                return (
                  <li key={m} className="sb-badge sb-badge--neutral gap-1.5">
                    <Icon className="size-4" strokeWidth={1.5} aria-hidden />
                    {m}
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="caption text-ink-muted">© {new Date().getFullYear()} Starboy. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
