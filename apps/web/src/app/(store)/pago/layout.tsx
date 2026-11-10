import { RequireAuth } from "@/components/auth/RequireAuth";

export default function PaymentLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
