"use client";

import { Banknote, Plane, Truck } from "lucide-react";
import { useEffect, useState } from "react";

import { TOPBAR_MESSAGES } from "@/lib/site";

const ICONS = [Truck, Banknote, Plane];

/** Franja de beneficios. Escritorio: los 3 mensajes. Móvil: uno a la vez, rotando (sin rotar si se pide menos movimiento). */
export function TopBar() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setCurrent((n) => (n + 1) % TOPBAR_MESSAGES.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-sb-navy-deep text-on-brand">
      <ul className="mx-auto flex h-9 max-w-7xl items-center justify-center gap-10 px-4 md:px-8">
        {TOPBAR_MESSAGES.map((text, i) => {
          const Icon = ICONS[i];
          return (
            <li key={text} className={`label items-center gap-2 ${i === current ? "flex" : "hidden"} md:flex`}>
              <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              {text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
