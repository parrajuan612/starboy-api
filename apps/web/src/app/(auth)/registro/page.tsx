import type { Metadata } from "next";

import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="display-md mb-2">Crear cuenta</h1>
      <p className="body text-ink-muted mb-8">Compra más rápido y sigue tus pedidos y encargos.</p>
      <RegisterForm next={next} />
    </>
  );
}
