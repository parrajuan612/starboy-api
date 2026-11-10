"use client";

import { useEffect } from "react";

import { useCartStore } from "@/store/cart";

/** Mantiene el carrito igual entre pestañas: si otra pestaña lo cambia, esta lo relee de localStorage. */
export function CartEffects() {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sb-cart") void useCartStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
