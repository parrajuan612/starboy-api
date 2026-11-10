import type { Metadata } from "next";

import { CartPage } from "@/components/cart/CartPage";

export const metadata: Metadata = { title: "Carrito", robots: { index: false } };

export default function Page() {
  return <CartPage />;
}
