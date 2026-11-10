import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * false en el servidor y en el primer render del cliente; true después. El carrito vive en localStorage,
 * así que lo que dependa de él debe mostrarse solo cuando esto sea true (si no, el HTML no coincide).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
