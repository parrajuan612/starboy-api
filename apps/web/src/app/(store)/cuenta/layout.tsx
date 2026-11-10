import type { Metadata } from "next";

import { AccountNav } from "@/components/account/AccountNav";
import { RequireAuth } from "@/components/auth/RequireAuth";

export const metadata: Metadata = { title: { default: "Mi cuenta", template: "%s · Mi cuenta" }, robots: { index: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
        <h1 className="display-md">Mi cuenta</h1>
        <AccountNav />
        <div className="mt-8">{children}</div>
      </div>
    </RequireAuth>
  );
}
