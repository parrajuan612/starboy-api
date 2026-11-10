import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/AdminNav";
import { RequireAuth } from "@/components/auth/RequireAuth";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s · Panel Starboy" },
  robots: { index: false },
};

/** Panel: solo ADMIN y STAFF; la API vuelve a validar el rol en cada endpoint. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth roles={["ADMIN", "STAFF"]}>
      <div className="min-h-dvh md:grid md:grid-cols-[240px_minmax(0,1fr)]">
        <AdminNav />
        <main className="min-w-0 p-4 md:p-10">{children}</main>
      </div>
    </RequireAuth>
  );
}
