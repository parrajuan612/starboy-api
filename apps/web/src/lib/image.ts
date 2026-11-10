/** Hosts que el optimizador de imágenes de Next puede procesar (ver images.remotePatterns en next.config.ts). */
const OPTIMIZABLE_HOSTS = new Set(["res.cloudinary.com"]);

/**
 * Las fotos de producto viven en Cloudinary. Todo lo demás (ilustraciones locales de demo, SVG, otro host)
 * se sirve tal cual: así una URL inesperada nunca rompe la página con un error de «host no configurado».
 */
export function shouldOptimize(src: string): boolean {
  if (src.startsWith("/") || src.toLowerCase().endsWith(".svg")) return false;
  try {
    return OPTIMIZABLE_HOSTS.has(new URL(src).hostname);
  } catch {
    return false;
  }
}
