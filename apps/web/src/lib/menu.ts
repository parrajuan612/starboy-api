import type { Brand, Category } from "@/types";

/**
 * Modelo de navegación único: lo usan el megamenú (escritorio), el drawer (móvil) y el footer.
 * Es una función pura sobre los datos de la API, así que se puede probar sin React.
 */
export interface NavLink {
  label: string;
  href: string;
}

export interface NavGroup {
  title: string;
  href?: string;
  links: NavLink[];
}

export interface NavItem {
  key: string;
  /** Texto del menú de escritorio. */
  label: string;
  /** Parte del texto que solo se muestra en pantallas anchas (accesibilidad: sigue siendo parte del nombre). */
  labelExtra?: string;
  href: string;
  /** Si hay grupos, el ítem abre un megamenú (escritorio) o un acordeón (móvil). */
  groups?: NavGroup[];
  /** Enlace «Ver todo» del panel. */
  viewAll?: NavLink;
}

const MAX_BRANDS_IN_GENDER_MENU = 6;

const bySort = (a: Category, b: Category) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "es");

function genderItem(key: "hombre" | "mujer", label: string, categories: Category[], brands: Brand[]): NavItem {
  const base = `/${key}`;
  const groups: NavGroup[] = [...categories].sort(bySort).map((c) => ({
    title: c.name,
    href: `${base}/${c.slug}`,
    links: [...c.children].sort(bySort).map((s) => ({ label: s.name, href: `${base}/${c.slug}/${s.slug}` })),
  }));

  if (brands.length > 0) {
    const shown = brands.slice(0, MAX_BRANDS_IN_GENDER_MENU).map((b) => ({ label: b.name, href: `${base}?marca=${b.slug}` }));
    groups.push({
      title: "Marcas",
      href: "/marcas",
      links: brands.length > shown.length ? [...shown, { label: "Ver todas", href: "/marcas" }] : shown,
    });
  }
  groups.push({
    title: "Descubre",
    links: [
      { label: "Nuevos lanzamientos", href: `/nuevos?genero=${key}` },
      { label: "Promociones", href: `/promociones?genero=${key}` },
    ],
  });

  return { key, label, href: base, groups: groups.length > 1 ? groups : undefined, viewAll: { label: `Ver todo ${label.toLowerCase()}`, href: base } };
}

/** Construye la navegación principal. Sin datos de la API, los ítems quedan como enlaces simples (sin panel). */
export function buildNav(categories: Category[], brands: Brand[]): NavItem[] {
  const accesorios = categories.find((c) => c.slug === "accesorios");
  const items: NavItem[] = [
    genderItem("hombre", "Hombre", categories, brands),
    genderItem("mujer", "Mujer", categories, brands),
  ];

  items.push({
    key: "accesorios",
    label: "Accesorios",
    href: "/accesorios",
    groups: accesorios?.children.length
      ? [{ title: "Accesorios", links: [...accesorios.children].sort(bySort).map((s) => ({ label: s.name, href: `/accesorios/${s.slug}` })) }]
      : undefined,
    viewAll: { label: "Ver todos los accesorios", href: "/accesorios" },
  });

  items.push({
    key: "marcas",
    label: "Marcas",
    href: "/marcas",
    groups: brands.length ? [{ title: "Marcas", links: brands.map((b) => ({ label: b.name, href: `/marcas/${b.slug}` })) }] : undefined,
    viewAll: { label: "Ver todas las marcas", href: "/marcas" },
  });

  items.push({ key: "nuevos", label: "Nuevos", labelExtra: " lanzamientos", href: "/nuevos" });

  items.push({
    key: "encargos",
    label: "Encargos USA",
    href: "/encargos-usa",
    groups: [
      {
        title: "Encargos USA",
        links: [
          { label: "Stock disponible", href: "/encargos-usa/stock" },
          { label: "Traemos cualquier referencia", href: "/encargos-usa/cotizar" },
          { label: "¿Cómo funciona?", href: "/encargos-usa" },
          { label: "Tiempo de entrega", href: "/encargos-usa#tiempos" },
          { label: "Solicitar cotización", href: "/encargos-usa/cotizar" },
        ],
      },
    ],
    viewAll: { label: "Solicitar cotización", href: "/encargos-usa/cotizar" },
  });

  items.push({ key: "promociones", label: "Promociones", href: "/promociones" });
  return items;
}

/** Texto completo de un ítem (para el drawer y los lectores de pantalla). */
export const fullLabel = (i: NavItem) => `${i.label}${i.labelExtra ?? ""}`;
