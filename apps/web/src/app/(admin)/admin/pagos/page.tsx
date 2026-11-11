import type { Metadata } from "next";

import { PaymentsAdmin } from "@/components/admin/PaymentsAdmin";
import { RequireAuth } from "@/components/auth/RequireAuth";

export const metadata: Metadata = { title: "Pagos" };

export default function AdminPaymentsPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <PaymentsAdmin />
    </RequireAuth>
  );
}
