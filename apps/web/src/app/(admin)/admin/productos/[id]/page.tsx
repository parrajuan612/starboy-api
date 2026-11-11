import type { Metadata } from "next";
import { Suspense } from "react";

import { ProductEditor } from "@/components/admin/catalog/ProductEditor";
import { RequireAuth } from "@/components/auth/RequireAuth";

export const metadata: Metadata = { title: "Editar producto" };

export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth roles={["ADMIN"]}>
      <Suspense>
        <ProductEditor id={id} />
      </Suspense>
    </RequireAuth>
  );
}
