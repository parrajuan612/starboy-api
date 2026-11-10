import type { Metadata } from "next";

import { SandboxPayment } from "@/components/checkout/SandboxPayment";

export const metadata: Metadata = { title: "Pago", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** checkout_url de la pasarela de pruebas del backend: /pago/sandbox/{ref}?pid={id del pago}. */
export default async function Page({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ pid?: string }> }) {
  const { ref } = await params;
  const { pid } = await searchParams;
  return <SandboxPayment providerRef={ref} paymentId={pid && UUID.test(pid) ? pid : undefined} />;
}
