"use client";

import { LogOut, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { logout } from "@/lib/auth";
import { selectIsBackoffice, useAuthStore } from "@/store/auth";

export function AccountMenu() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const backoffice = useAuthStore(selectIsBackoffice);

  if (status !== "authenticated" || !user) {
    return (
      <Link href="/login" aria-label="Ingresar" className="inline-flex size-11 items-center justify-center">
        <User strokeWidth={1.5} className="size-6" aria-hidden />
      </Link>
    );
  }

  return (
    <div className="flex items-center">
      {backoffice && (
        <Link href="/admin" className="label hover:text-accent mr-3 hidden md:inline">
          Panel
        </Link>
      )}
      <Link href="/cuenta" aria-label={`Mi cuenta, ${user.full_name}`} className="inline-flex size-11 items-center justify-center">
        <User strokeWidth={1.5} className="size-6" aria-hidden />
      </Link>
      <button
        type="button"
        aria-label="Cerrar sesión"
        className="inline-flex size-11 items-center justify-center"
        onClick={async () => {
          await logout();
          router.push("/");
        }}
      >
        <LogOut strokeWidth={1.5} className="size-5" aria-hidden />
      </button>
    </div>
  );
}
