import type { Metadata } from "next";

import { ImportsAdmin } from "@/components/admin/ImportsAdmin";

export const metadata: Metadata = { title: "Encargos USA" };

export default function AdminImportsPage() {
  return <ImportsAdmin />;
}
