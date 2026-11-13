import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { parseFilters, resolveCategoryPath, type RawSearchParams, type Scope } from "@/lib/catalog-query";
import { getMenuSource } from "@/lib/catalog-server";
import type { Category } from "@/types";

import type { Crumb } from "./Breadcrumbs";
import { CatalogView } from "./CatalogView";
import type { CatNode } from "./FilterPanel";

interface RouteProps {
  /** Ruta base de la sección, ej. "/hombre". */
  base: string;
  title: string;
  intro?: string;
  gender?: "MEN" | "WOMEN";
  /** Solo nuevos lanzamientos o solo con descuento. */
  flag?: "new" | "sale";
  /** Categoría raíz fija de la sección (ej. "accesorios"): los segmentos de la URL son sus hijas. */
  rootCategory?: string;
  /** Segmentos de la URL después de `base` (/hombre/zapatos/sneakers → ["zapatos","sneakers"]). */
  segments: string[];
  searchParams: RawSearchParams;
}

const href = (base: string, chain: Category[]) => [base, ...chain.map((c) => c.slug)].join("/");

/** Categorías de este nivel y su rama abierta, como enlaces dentro de la sección. */
function navNodes(tree: Category[], base: string, prefix: Category[], current: Category[]): CatNode[] {
  return tree.map((c) => {
    const chain = [...prefix, c];
    const inPath = current[prefix.length]?.slug === c.slug;
    return {
      label: c.name,
      href: href(base, chain),
      current: inPath && current.length === prefix.length + 1,
      open: inPath,
      children: navNodes(c.children, base, chain, current),
    };
  });
}

/** Resuelve la URL contra el árbol de categorías real. null = la ruta no existe (404). */
async function resolve(p: RouteProps) {
  const menu = await getMenuSource();
  let tree = menu.categories;
  let fixed: Category[] = [];
  if (p.rootCategory) {
    const root = tree.find((c) => c.slug === p.rootCategory);
    if (!root) return { menu, tree: [] as Category[], chain: [] as Category[], fixed, notFound: p.segments.length > 0 };
    fixed = [root];
    tree = root.children;
  }
  const match = resolveCategoryPath(tree, p.segments);
  if (!match) return { menu, tree, chain: [] as Category[], fixed, notFound: true };
  return { menu, tree, chain: match.chain, fixed, notFound: false };
}

export async function catalogMetadata(p: RouteProps): Promise<Metadata> {
  const r = await resolve(p);
  if (r.notFound) return {};
  const leaf = r.chain.at(-1)?.name;
  const title = leaf ? `${leaf} · ${p.title}` : p.title;
  return { title, alternates: { canonical: href(p.base, r.chain) }, description: p.intro };
}

export async function CatalogRoute(p: RouteProps) {
  const r = await resolve(p);
  if (r.notFound) notFound();

  const filters = parseFilters(p.searchParams);
  const leaf = r.chain.at(-1) ?? r.fixed.at(-1);
  const scope: Scope = { gender: p.gender, category: leaf?.slug, flag: p.flag };
  const path = href(p.base, r.chain);

  const crumbs: Crumb[] = [{ label: "Inicio", href: "/" }, { label: p.title, href: p.base }];
  r.chain.forEach((c, i) => crumbs.push({ label: c.name, href: href(p.base, r.chain.slice(0, i + 1)) }));
  if (r.chain.length === 0) crumbs.splice(1, 1, { label: p.title }); // la sección misma es la última miga

  const nodes = navNodes(r.tree, p.base, [], r.chain);
  return (
    <CatalogView
      title={r.chain.at(-1)?.name ?? p.title}
      intro={r.chain.length === 0 ? p.intro : undefined}
      path={path}
      crumbs={crumbs}
      scope={scope}
      filters={filters}
      brands={r.menu.brands}
      categoryNav={nodes.length ? { nodes, allHref: p.base, allCurrent: r.chain.length === 0 } : null}
    />
  );
}
