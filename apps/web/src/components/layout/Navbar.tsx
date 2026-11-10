import { buildNav } from "@/lib/menu";
import type { MenuSource } from "@/lib/catalog-server";
import { Logo } from "@/components/ui";

import { AccountMenu } from "./AccountMenu";
import { CartButton } from "./CartButton";
import { DesktopNav } from "./DesktopNav";
import { MobileNav } from "./MobileNav";
import { SearchToggle } from "./SearchToggle";

/**
 * Navbar sticky, tema Editorial (fondo surface-raised). Es la referencia de posición del megamenú y de la barra de búsqueda.
 * Móvil: hamburguesa + logo + buscar + bolsa. Escritorio: logo + menú + buscar + cuenta + bolsa.
 */
export function Navbar({ menu }: { menu: MenuSource }) {
  const items = buildNav(menu.categories, menu.brands);
  return (
    <header className="theme-editorial bg-surface-raised text-ink border-line sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-2 md:px-6 lg:px-8">
        <div className="flex items-center gap-1 lg:gap-10">
          <MobileNav items={items} />
          <Logo />
        </div>
        <DesktopNav items={items} />
        <div className="flex items-center">
          <SearchToggle />
          <div className="hidden lg:flex">
            <AccountMenu />
          </div>
          <CartButton />
        </div>
      </div>
    </header>
  );
}
