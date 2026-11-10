"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { NavItem } from "@/lib/menu";

/**
 * Menú de escritorio con megamenú. Se abre con hover o con clic/Enter; Escape lo cierra y devuelve el foco.
 * El panel vive dentro del <li> de su botón para que el orden de Tab sea natural (botón → enlaces del panel → siguiente ítem).
 */
export function DesktopNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setOpen(null);

  return (
    <nav
      aria-label="Principal"
      className="hidden lg:block"
      onMouseLeave={close}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        close();
        e.currentTarget.querySelector<HTMLElement>(`[data-trigger="${open}"]`)?.focus();
      }}
    >
      <ul className="flex items-center gap-7 xl:gap-8">
        {items.map((item) => {
          const hasPanel = !!item.groups?.length;
          const panelId = `mega-${item.key}`;
          const isOpen = open === item.key;
          return (
            <li key={item.key} onMouseEnter={() => setOpen(hasPanel ? item.key : null)}>
              {hasPanel ? (
                <button
                  type="button"
                  data-trigger={item.key}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : item.key)}
                  className="label hover:text-accent inline-flex h-16 items-center gap-1"
                >
                  {item.label}
                  <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} strokeWidth={1.5} aria-hidden />
                </button>
              ) : (
                <Link href={item.href} className="label hover:text-accent inline-flex h-16 items-center" onClick={close}>
                  <span>
                    {item.label}
                    {item.labelExtra && <span className="hidden xl:inline">{item.labelExtra}</span>}
                  </span>
                </Link>
              )}

              {hasPanel && isOpen && (
                <div id={panelId} className="theme-editorial bg-surface border-line absolute inset-x-0 top-full border-y shadow-drawer">
                  <div className="mx-auto grid max-w-7xl grid-cols-[220px_1fr] gap-10 px-8 py-8">
                    <div className="border-line flex flex-col justify-between border-r pr-8">
                      <p className="display-md">{item.label}</p>
                      {item.viewAll && (
                        <Link href={item.viewAll.href} onClick={close} className="label hover:text-accent mt-6 inline-flex items-center gap-2">
                          {item.viewAll.label}
                          <span aria-hidden>→</span>
                        </Link>
                      )}
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-8 gap-y-6">
                      {item.groups!.map((g) => (
                        <div key={g.title}>
                          {g.title !== item.label && (
                            <p className="display-sm mb-3">
                              {g.href ? (
                                <Link href={g.href} onClick={close} className="hover:text-accent">
                                  {g.title}
                                </Link>
                              ) : (
                                g.title
                              )}
                            </p>
                          )}
                          <ul className="space-y-2">
                            {g.links.map((l) => (
                              <li key={l.href + l.label}>
                                <Link href={l.href} onClick={close} className="body-sm text-ink-muted hover:text-ink">
                                  {l.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
