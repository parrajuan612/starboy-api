import type { Metadata } from "next";

import { ProductsAdmin } from "@/components/admin/catalog/ProductsAdmin";
import { RequireAuth } from "@/components/auth/RequireAuth";

export const metadata: Metadata = { title: "Productos" };

export default function AdminProductsPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <ProductsAdmin />
    </RequireAuth>
  );
}
