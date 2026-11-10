import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="display-md mb-2">Ingresar</h1>
      <p className="body text-ink-muted mb-8">Entra para comprar, seguir tus pedidos y pedir encargos.</p>
      <LoginForm next={next} />
    </>
  );
}
