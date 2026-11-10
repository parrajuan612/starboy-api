import { BadgeCheck, Banknote, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs, type Crumb } from "@/components/product/Breadcrumbs";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductPurchase } from "@/components/product/ProductPurchase";
import { findCategoryChain } from "@/lib/catalog-query";
import { getMenuSource, getProduct } from "@/lib/catalog-server";
import type { ProductDetail } from "@/types";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p || p === "notfound") return { robots: { index: false } };
  const title = [p.brand?.name, p.name, p.colorway].filter(Boolean).join(" ");
  const description = p.description?.slice(0, 160) || `${title} en Starboy. Envíos a toda Colombia.`;
  const image = p.images[0]?.url;
  return {
    title,
    description,
    alternates: { canonical: `/producto/${p.slug}` },
    openGraph: { title, description, type: "website", images: image ? [{ url: image }] : undefined },
  };
}

/** Datos estructurados schema.org/Product (RNF-03). El `<` se escapa para que el JSON nunca cierre el <script>. */
function jsonLd(p: ProductDetail) {
  const inStock = p.variants.some((v) => v.in_stock);
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: [p.name, p.colorway].filter(Boolean).join(" "),
    description: p.description,
    image: p.images.map((i) => i.url),
    brand: p.brand ? { "@type": "Brand", name: p.brand.name } : undefined,
    sku: p.variants[0]?.sku,
    offers: {
      "@type": "Offer",
      priceCurrency: "COP",
      price: p.base_price_cop,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  }).replace(/</g, "\\u003c");
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [p, menu] = await Promise.all([getProduct(slug), getMenuSource()]);
  if (p === "notfound") notFound();
  if (p === null) {
    return (
      <div role="alert" className="mx-auto max-w-xl px-4 py-20 text-center md:px-8">
        <h1 className="display-md">No pudimos cargar este producto</h1>
        <p className="body text-ink-muted mt-3">Tuvimos un problema de conexión. Inténtalo de nuevo en unos segundos.</p>
        <Link href={`/producto/${slug}`} className="sb-btn sb-btn--primary mt-6">
          Reintentar
        </Link>
      </div>
    );
  }

  // Migas: Inicio / (Hombre|Mujer) / Zapatos / Sneakers / Producto. Unisex enlaza al catálogo general.
  const section = p.gender === "MEN" ? { label: "Hombre", base: "/hombre" } : p.gender === "WOMEN" ? { label: "Mujer", base: "/mujer" } : { label: "Productos", base: "/productos" };
  const chain = p.category ? findCategoryChain(menu.categories, p.category.slug) : [];
  const crumbs: Crumb[] = [{ label: "Inicio", href: "/" }, { label: section.label, href: section.base }];
  chain.forEach((c, i) => crumbs.push({ label: c.name, href: [section.base, ...chain.slice(0, i + 1).map((x) => x.slug)].join("/") }));
  crumbs.push({ label: p.name });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(p) }} />
      <Breadcrumbs items={crumbs} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
        <ProductGallery images={p.images} name={p.name} />

        <div className="space-y-6">
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {p.brand && (
                <Link href={`/marcas/${p.brand.slug}`} className="label hover:text-accent">
                  {p.brand.name}
                </Link>
              )}
              {p.discount_percent > 0 && <span className="sb-badge sb-badge--discount">-{p.discount_percent}%</span>}
              {p.is_new_release && <span className="sb-badge sb-badge--brand-outline">Nuevo</span>}
              {p.origin === "IMPORTED_STOCK" && <span className="sb-badge sb-badge--neutral">Importado desde USA</span>}
            </div>
            <h1 className="title">{p.name}</h1>
            {p.colorway && <p className="body-sm text-ink-muted">{p.colorway}</p>}
          </header>

          <ProductPurchase
            slug={p.slug}
            name={p.name}
            basePrice={p.base_price_cop}
            compareAt={p.compare_at_price_cop}
            imageUrl={p.images[0]?.url}
            initialVariants={p.variants}
          />

          {p.description && (
            <section className="border-line border-t pt-6">
              <h2 className="label mb-2">Descripción</h2>
              <p className="body text-ink-muted whitespace-pre-line">{p.description}</p>
            </section>
          )}

          <ul className="border-line grid gap-3 border-t pt-6 sm:grid-cols-3">
            {[
              { Icon: BadgeCheck, t: "100 % original", d: "Garantizamos autenticidad" },
              { Icon: Truck, t: "Envíos a toda Colombia", d: "Rápido y seguro" },
              { Icon: Banknote, t: "Pago contra entrega", d: "Compra con tranquilidad" },
            ].map(({ Icon, t, d }) => (
              <li key={t} className="flex items-start gap-3 sm:block">
                <Icon className="size-6 shrink-0 sm:mb-2" strokeWidth={1.5} aria-hidden />
                <div>
                  <p className="label">{t}</p>
                  <p className="body-sm text-ink-muted">{d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
