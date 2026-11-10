import type { Metadata } from "next";

import { OrdersAdmin } from "@/components/admin/OrdersAdmin";

export const metadata: Metadata = { title: "Órdenes" };

export default function AdminOrdersPage() {
  return <OrdersAdmin />;
}
