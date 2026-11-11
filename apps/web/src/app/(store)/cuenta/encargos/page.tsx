import type { Metadata } from "next";

import { ImportsList } from "@/components/imports/ImportsList";

export const metadata: Metadata = { title: "Mis encargos" };

export default function ImportsPage() {
  return <ImportsList />;
}
