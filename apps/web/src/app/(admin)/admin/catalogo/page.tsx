import type { Metadata } from "next";

import { CatalogRefsAdmin } from "@/components/admin/catalog/CatalogRefsAdmin";
import { RequireAuth } from "@/components/auth/RequireAuth";

export const metadata: Metadata = { title: "Catálogo" };

export default function AdminCatalogPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <CatalogRefsAdmin />
    </RequireAuth>
  );
}
