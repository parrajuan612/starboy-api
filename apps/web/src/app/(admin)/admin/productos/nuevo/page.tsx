import type { Metadata } from "next";

import { NewProduct } from "@/components/admin/catalog/ProductEditor";
import { RequireAuth } from "@/components/auth/RequireAuth";

export const metadata: Metadata = { title: "Nuevo producto" };

export default function AdminNewProductPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <NewProduct />
    </RequireAuth>
  );
}
