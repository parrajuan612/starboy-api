import type { Metadata } from "next";

import { HomeAdmin } from "@/components/admin/home/HomeAdmin";
import { RequireAuth } from "@/components/auth/RequireAuth";

export const metadata: Metadata = { title: "Inicio" };

export default function AdminHomePage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <HomeAdmin />
    </RequireAuth>
  );
}
