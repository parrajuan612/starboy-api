import type { Metadata } from "next";
import { Suspense } from "react";

import { PaymentReturn } from "@/components/checkout/PaymentReturn";

export const metadata: Metadata = { title: "Tu pago", robots: { index: false } };

/** Destino al que cualquier pasarela devuelve al cliente (ver apps/api/internal/platform/payments/README.md). */
export default function PaymentReturnPage() {
  return (
    <Suspense>
      <PaymentReturn />
    </Suspense>
  );
}
