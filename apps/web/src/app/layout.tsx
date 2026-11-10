import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/components/providers/AuthProvider";
import { barlow, oswald } from "@/lib/fonts";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "Starboy", template: "%s · Starboy" },
  description: "Streetwear y sneakers en Colombia. Encargos desde USA.",
};

export const viewport: Viewport = {
  themeColor: "#05080F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" className={`${oswald.variable} ${barlow.variable}`}>
      <body className="theme-catalog bg-surface font-text text-ink min-h-dvh">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
