"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { Logo } from "@/components/ui";
import { logout } from "@/lib/auth";
import { fullLabel, type NavItem } from "@/lib/menu";
import { selectIsBackoffice, useAuthStore } from "@/store/auth";

/**
 * Drawer móvil. Usa <dialog>.showModal(): el navegador ya resuelve el foco atrapado, Escape y el fondo inerte.
 * Los acordeones son <details>, sin JS.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const backoffice = useAuthStore(selectIsBackoffice);

  // Si se agranda la ventana a escritorio con el drawer abierto, se cierra.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && dialog.current?.close();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex size-11 items-center justify-center lg:hidden"
      >
        <Menu className="size-6" strokeWidth={1.5} aria-hidden />
      </button>

      <dialog
        ref={dialog}
        aria-label="Menú"
        onClick={(e) => e.target === dialog.current && close()} // clic en el velo
        className="sb-navdrawer theme-editorial bg-surface text-ink fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(88vw,380px)] max-w-none overflow-y-auto p-0 shadow-drawer backdrop:bg-sb-ink/70"
      >
        <div className="border-line flex h-16 items-center justify-between border-b px-4">
          <Logo />
          <button type="button" aria-label="Cerrar menú" onClick={close} className="inline-flex size-11 items-center justify-center">
            <X className="size-6" strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <form role="search" action="/buscar" method="get" className="border-line flex gap-2 border-b p-4">
          <label htmlFor="mobile-q" className="sr-only">
            Buscar productos
          </label>
          <input id="mobile-q" name="q" type="search" required maxLength={100} autoComplete="off" placeholder="Buscar" className="sb-input" />
          <button type="submit" className="sb-btn sb-btn--primary shrink-0 px-4">
            Buscar
          </button>
        </form>

        <nav aria-label="Menú móvil">
          <ul>
            {items.map((item) => (
              <li key={item.key} className="border-line border-b">
                {item.groups?.length ? (
                  <details className="group">
                    <summary className="label flex min-h-14 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
                      {fullLabel(item)}
                      <ChevronDown className="size-5 transition-transform group-open:rotate-180" strokeWidth={1.5} aria-hidden />
                    </summary>
                    <div className="space-y-5 px-4 pb-5">
                      {item.viewAll && (
                        <Link href={item.viewAll.href} onClick={close} className="label inline-flex min-h-11 items-center gap-2">
                          {item.viewAll.label} <span aria-hidden>→</span>
                        </Link>
                      )}
                      {item.groups.map((g) => (
                        <div key={g.title}>
                          {/* Sin título repetido cuando el grupo se llama igual que el ítem (Accesorios, Marcas, Encargos USA) */}
                          {g.title !== item.label && <p className="display-sm mb-1">{g.title}</p>}
                          <ul>
                            {g.links.map((l) => (
                              <li key={l.href + l.label}>
                                <Link href={l.href} onClick={close} className="body text-ink-muted hover:text-ink flex min-h-11 items-center">
                                  {l.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                  <Link href={item.href} onClick={close} className="label flex min-h-14 items-center px-4">
                    {fullLabel(item)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-1 p-4">
          {status === "authenticated" && user ? (
            <>
              <p className="body-sm text-ink-muted pb-2">{user.full_name}</p>
              <Link href="/cuenta" onClick={close} className="label flex min-h-11 items-center">
                Mi cuenta
              </Link>
              {backoffice && (
                <Link href="/admin" onClick={close} className="label flex min-h-11 items-center">
                  Panel
                </Link>
              )}
              <button
                type="button"
                className="label flex min-h-11 w-full items-center"
                onClick={async () => {
                  close();
                  await logout();
                }}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={close} className="label flex min-h-11 items-center">
                Ingresar
              </Link>
              <Link href="/registro" onClick={close} className="label flex min-h-11 items-center">
                Crear cuenta
              </Link>
            </>
          )}
          <Link href="/contacto" onClick={close} className="label flex min-h-11 items-center">
            Contacto
          </Link>
        </div>
      </dialog>
    </>
  );
}
