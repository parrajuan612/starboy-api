import { RequireAuth } from "@/components/auth/RequireAuth";

/** Checkout y confirmación: exigen sesión (la API solo crea y muestra órdenes de su dueño). */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
