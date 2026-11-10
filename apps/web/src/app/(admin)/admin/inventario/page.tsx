import type { Metadata } from "next";

import { InventoryAdmin } from "@/components/admin/InventoryAdmin";

export const metadata: Metadata = { title: "Inventario" };

export default function AdminInventoryPage() {
  return <InventoryAdmin />;
}
