import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartEffects } from "@/components/cart/CartEffects";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { TopBar } from "@/components/layout/TopBar";
import { AnnouncementBar } from "@/components/home/AnnouncementBar";
import { getHome, getMenuSource } from "@/lib/catalog-server";

// Las páginas de la tienda se regeneran cada 5 min (300 s, igual a MENU_REVALIDATE; Next exige un literal aquí):
// el menú sigue lo que haya en la base sin redeploy.
export const revalidate = 300;

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [menu, home] = await Promise.all([getMenuSource(), getHome()]);
  return (
    <>
      {home?.announcement && <AnnouncementBar text={home.announcement.text} url={home.announcement.url} />}
      <TopBar />
      <Navbar menu={menu} />
      <main className="min-h-[60dvh]">{children}</main>
      <Footer />
      <CartDrawer />
      <CartEffects />
    </>
  );
}
