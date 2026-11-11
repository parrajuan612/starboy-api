import type { Metadata } from "next";

import { SettingsAdmin } from "@/components/admin/catalog/SettingsAdmin";
import { RequireAuth } from "@/components/auth/RequireAuth";

export const metadata: Metadata = { title: "Ajustes" };

export default function AdminSettingsPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <SettingsAdmin />
    </RequireAuth>
  );
}
