import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="theme-editorial bg-surface border-line border-b">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 md:px-8">
          <Logo />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10 md:py-16">{children}</main>
    </div>
  );
}
