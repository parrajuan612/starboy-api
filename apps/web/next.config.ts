import type { NextConfig } from "next";

// API de Go. Solo la lee el servidor de Next (no se expone al navegador).
const API_URL = process.env.API_URL ?? "http://localhost:8082";

const nextConfig: NextConfig = {
  images: {
    // Fotos de producto en Cloudinary (SSD ADR). Cualquier otro origen se muestra sin optimizar (ver lib/image.ts).
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
    formats: ["image/avif", "image/webp"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // El navegador llama a /api/v1/* en el mismo origen y Next lo reenvía a la API.
  // Así la cookie de refresh (httpOnly) funciona sin CORS ni SameSite=None.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
