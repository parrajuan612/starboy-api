import type { Metadata } from "next";
import { Suspense } from "react";

import { ImportDetail } from "@/components/imports/ImportDetail";

export const metadata: Metadata = { title: "Seguimiento del encargo" };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ImportDetail id={id} />
    </Suspense>
  );
}
