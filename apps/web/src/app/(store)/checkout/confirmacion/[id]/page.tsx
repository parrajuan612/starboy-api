import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderConfirmation } from "@/components/checkout/OrderConfirmation";

export const metadata: Metadata = { title: "Tu orden", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pago?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { pago } = await searchParams;
  return <OrderConfirmation id={id} pago={pago} />;
}
