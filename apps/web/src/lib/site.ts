import { formatCOP } from "@/lib/format";

/** Datos del sitio que hoy viven en código y más adelante se editan desde el admin (RF-26). */

/** Umbral de envío gratis (settings.free_shipping_threshold_cop). TODO: leerlo de la API cuando haya endpoint público. */
export const FREE_SHIPPING_FROM_COP = 300_000;

export const TOPBAR_MESSAGES = [
  `Envíos gratis desde ${formatCOP(FREE_SHIPPING_FROM_COP)}`,
  "Pago contra entrega",
  "Importamos desde USA",
] as const;

export const TAGLINE = "Más que una tienda, somos cultura.";

export interface Social {
  key: "instagram" | "tiktok" | "whatsapp";
  label: string;
  href: string;
}

const instagram = process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "https://www.instagram.com/starboy.streetwear";
const tiktok = process.env.NEXT_PUBLIC_TIKTOK_URL;
const whatsappNumber = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");

/** Solo se muestran las redes que tienen URL configurada: nunca enlaces rotos. */
export const SOCIALS: Social[] = [
  { key: "instagram", label: "Instagram", href: instagram },
  ...(tiktok ? [{ key: "tiktok" as const, label: "TikTok", href: tiktok }] : []),
  ...(whatsappNumber ? [{ key: "whatsapp" as const, label: "WhatsApp", href: `https://wa.me/${whatsappNumber}` }] : []),
];

export const PAYMENT_METHODS = ["Mercado Pago", "Transferencia bancaria", "Contra entrega"] as const;

export interface FooterLink {
  label: string;
  href: string;
}

export const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Tienda",
    links: [
      { label: "Hombre", href: "/hombre" },
      { label: "Mujer", href: "/mujer" },
      { label: "Accesorios", href: "/accesorios" },
      { label: "Marcas", href: "/marcas" },
      { label: "Nuevos lanzamientos", href: "/nuevos" },
      { label: "Promociones", href: "/promociones" },
    ],
  },
  {
    title: "Información",
    links: [
      { label: "Encargos USA", href: "/encargos-usa" },
      { label: "Nosotros", href: "/nosotros" },
      { label: "Términos y condiciones", href: "/politicas/terminos" },
      { label: "Política de privacidad", href: "/politicas/privacidad" },
      { label: "Cambios y devoluciones", href: "/politicas/cambios" },
      { label: "Política de envíos", href: "/politicas/envios" },
    ],
  },
  {
    title: "Ayuda",
    links: [
      { label: "Contacto", href: "/contacto" },
      { label: "Preguntas frecuentes", href: "/ayuda/preguntas-frecuentes" },
      { label: "Guía de tallas", href: "/ayuda/guia-de-tallas" },
      { label: "Rastrear mi pedido", href: "/rastreo" },
      { label: "Rastrear mi encargo", href: "/encargos-usa/rastreo" },
    ],
  },
];

/** Primer segmento de las rutas que la tienda va a tener; mientras no exista la página real se muestra «Próximamente». */
export const PLANNED_SECTIONS = new Set([
  "hombre", "mujer", "accesorios", "marcas", "nuevos", "promociones", "encargos-usa",
  "contacto", "nosotros", "politicas", "ayuda", "buscar", "rastreo", "carrito", "checkout",
]);
