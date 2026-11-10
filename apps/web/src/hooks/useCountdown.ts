"use client";

import { useEffect, useState } from "react";

/** Segundos que faltan hasta `targetIso` (null mientras no se ha medido; nunca baja de 0). Se actualiza cada segundo. */
export function useCountdown(targetIso?: string): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!targetIso) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [targetIso]);

  if (!targetIso || now === null) return null;
  return Math.max(Math.ceil((new Date(targetIso).getTime() - now) / 1000), 0);
}

export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
