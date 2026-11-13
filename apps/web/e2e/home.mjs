// Portada editable: API (validación, resolución de productos), panel /admin/inicio (subir fotos, filas, guardar) y la tienda.
import { chromium } from "playwright-core";
import { W, API, CHROME, OUT } from "./env.mjs";
import { writeFileSync } from "fs";
import { execFileSync } from "node:child_process";

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
let ok = 0, bad = 0;
const check = (n, c, x = "") => { (c ? ok++ : bad++); console.log(`${c ? "✔" : "✘"} ${n}${x !== "" ? "  → " + x : ""}`); };
const api = async (method, path, token, body) => {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); return { status: r.status, json: t ? JSON.parse(t) : null };
};
const noH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// Fotos de prueba (degradados reales para que las capturas se vean como una portada).
const makeImg = (name, w, h, c1, c2) => {
  const p = `${OUT}/${name}.png`;
  execFileSync("python3", ["-I", "-c", `
from PIL import Image
w,h=${w},${h}; a=${JSON.stringify(c1)}; b=${JSON.stringify(c2)}
im=Image.new("RGB",(w,h))
px=im.load()
for y in range(h):
    for x in range(w):
        t=(x/w*0.6+y/h*0.4)
        px[x,y]=tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
im.save(${JSON.stringify(p)})`]);
  return p;
};
const HERO = makeImg("home-hero", 1800, 900, [20, 30, 70], [210, 90, 60]);
const BAN1 = makeImg("home-ban1", 900, 1100, [30, 90, 80], [240, 200, 90]);
const BAN2 = makeImg("home-ban2", 900, 1100, [90, 30, 90], [90, 160, 230]);

let TOK, original;
const restore = async () => { try { if (original) await api("PUT", "/admin/home", TOK, original); } catch (e) { console.log("restore:", e.message); } };

try {
  TOK = (await api("POST", "/auth/login", null, { email: "admin@starboy.local", password: "una-clave-larga-segura" })).json.data.access_token;
  original = (await api("GET", "/admin/home", TOK)).json.data;

  // ── API
  const anon = await api("GET", "/admin/home");
  check("el contenido admin exige sesión", anon.status === 401, anon.status);
  const pub = (await api("GET", "/home")).json.data;
  check("la portada pública trae las secciones con productos", Array.isArray(pub.sections) && pub.sections.every((s) => s.products.length > 0));
  const withBad = (patch) => api("PUT", "/admin/home", TOK, { ...original, ...patch });
  let r = await withBad({ hero: { ...original.hero, primary_url: "javascript:alert(1)" } });
  check("enlace «javascript:» rechazado", r.status === 422 && !!r.json.error.details["hero.primary_url"], r.status);
  r = await withBad({ hero: { ...original.hero, primary_url: "//evil.com" } });
  check("enlace a otro sitio sin https rechazado", r.status === 422);
  r = await withBad({ banners: Array.from({ length: 4 }, () => ({ image_url: "/uploads/x.png", title: "", subtitle: "", label: "", url: "" })) });
  check("más de 3 banners rechazado", r.status === 422 && !!r.json.error.details["banners"]);
  r = await withBad({ sections: [{ kind: "PICKED", enabled: true, title: "x", subtitle: "", limit: 4, product_slugs: ["a", "a"], view_all_url: "" }] });
  check("productos repetidos rechazados", r.status === 422);
  check("nada se guardó tras los rechazos", JSON.stringify((await api("GET", "/admin/home", TOK)).json.data) === JSON.stringify(original));

  // ── /nuevos y /promociones (filtros del catálogo)
  const newApi = (await api("GET", "/products?new=true&limit=50")).json;
  check("/products?new=true solo trae nuevos lanzamientos", newApi.data.length > 0 && newApi.data.every((p) => p.is_new_release), `${newApi.data.length}`);
  const saleApi = (await api("GET", "/products?sale=true&limit=50")).json;
  check("/products?sale=true solo trae productos con descuento", saleApi.data.every((p) => p.discount_percent > 0), `${saleApi.data.length}`);
  const ctx0 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CO" }); const p0 = await ctx0.newPage();
  await p0.goto(W + "/nuevos"); await p0.waitForSelector("article");
  check("/nuevos es una página real (no «Próximamente»)", !(await p0.locator("main").innerText()).includes("Próximamente"));
  check("/nuevos muestra solo los nuevos", (await p0.locator("main article").count()) === Math.min(newApi.data.length, 12), `${await p0.locator("main article").count()}`);
  await p0.goto(W + "/promociones"); await p0.waitForLoadState("networkidle");
  check("/promociones responde", (await p0.locator("main h1").innerText()).toLowerCase().includes("promociones"));
  await ctx0.close();

  // ── Panel
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CO" }); const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => m.type() === "error" && !/40[134]|409|422|429|Failed to load resource/.test(m.text()) && console.log("CONSOLE", m.text().slice(0, 200)));
  await page.goto(W + "/login"); await page.locator('[name="email"]').fill("admin@starboy.local"); await page.locator('[name="password"]').fill("una-clave-larga-segura");
  await page.getByRole("button", { name: /Entrar|Iniciar sesión|Ingresar/i }).first().click(); await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  await page.goto(W + "/admin/inicio"); await page.getByRole("heading", { name: "Inicio", level: 1 }).waitFor();
  check("el panel carga el contenido actual", (await page.locator('[name="hero.title"]').inputValue()) === original.hero.title);
  check("el botón Guardar empieza deshabilitado", await page.getByRole("button", { name: "Guardar cambios" }).isDisabled());

  // aviso
  await page.getByLabel("Mostrar el aviso").check();
  await page.locator('[name="announcement.text"]').fill("Envío gratis en compras desde $300.000");
  await page.locator('[name="announcement.url"]').fill("/promociones");
  // hero con foto
  await page.locator('[name="hero.eyebrow"]').fill("Drop de temporada");
  await page.locator('[name="hero.title"]').fill("Calle con actitud");
  await page.locator('[name="hero.subtitle"]').fill("Lo nuevo en sneakers y ropa, listo para estrenar.");
  const heroCard = page.locator("section", { has: page.getByRole("heading", { name: "Banner principal" }) });
  await heroCard.locator('input[type="file"]').setInputFiles(HERO);
  await heroCard.getByAltText("Vista previa").waitFor({ timeout: 15000 });
  check("la foto del banner se sube y se previsualiza", (await heroCard.getByAltText("Vista previa").getAttribute("src")).startsWith("/uploads/"));
  // banners
  const banCard = page.locator("section", { has: page.getByRole("heading", { name: "Banners promocionales" }) });
  for (const [i, f] of [BAN1, BAN2].entries()) {
    await banCard.getByRole("button", { name: /Agregar banner/ }).click();
    await banCard.locator('input[type="file"]').nth(i).setInputFiles(f);
    await banCard.getByAltText("Vista previa").nth(i).waitFor({ timeout: 15000 });
    await page.locator(`[name="banners.${i}.title"]`).fill(i === 0 ? "Zapatillas" : "Camisetas");
    await page.locator(`[name="banners.${i}.subtitle"]`).fill(i === 0 ? "Las que no pueden faltar" : "Cortes oversize");
    await page.locator(`[name="banners.${i}.url`+`"]`).fill(i === 0 ? "/hombre" : "/mujer");
    await page.locator(`[name="banners.${i}.label"]`).fill("Comprar");
  }
  // fila manual con búsqueda
  const secCard = page.locator("section", { has: page.getByRole("heading", { name: "Filas de productos" }) });
  await secCard.getByRole("button", { name: /Agregar fila/ }).click();
  await secCard.locator('[name="sections.2.kind"]').selectOption("PICKED");
  await page.locator('[name="sections.2.title"]').fill("Elegidos por el equipo");
  await secCard.getByLabel("Buscar producto publicado").fill("gazelle");
  await secCard.getByRole("button", { name: "Agregar", exact: true }).first().waitFor({ timeout: 10000 });
  await secCard.getByRole("button", { name: "Agregar", exact: true }).first().click();
  check("el producto buscado se agrega a la selección", await secCard.getByText(/Productos de la sección \(1\/12\)/).waitFor({ timeout: 5000 }).then(() => true, () => false));
  // categorías
  const catCard = page.locator("section", { has: page.getByRole("heading", { name: "Categorías con foto" }) });
  await catCard.getByLabel("Mostrar este bloque").check();
  await catCard.getByRole("button", { name: /Agregar categoría/ }).click();
  await catCard.locator('input[type="file"]').first().setInputFiles(BAN1);
  await catCard.getByAltText("Vista previa").first().waitFor({ timeout: 15000 });
  await page.locator('[name="categories.items.0.title"]').fill("Zapatos");
  await page.locator('[name="categories.items.0.url"]').fill("/hombre/zapatos");
  check("hay aviso de cambios sin guardar", await page.getByText("Hay cambios sin guardar").isVisible());
  await page.screenshot({ path: `${OUT}/home-admin.png`, fullPage: true });

  // error de validación en el panel: enlace inválido
  await page.locator('[name="hero.primary_url"]').fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.locator('[name="hero.primary_url"][aria-invalid="true"]').waitFor({ timeout: 10000 });
  check("el error de enlace sale en su campo", (await page.locator("body").innerText()).includes("Usa una ruta de la tienda"));
  check("tras el error, nada cambió en la API", (await api("GET", "/admin/home", TOK)).json.data.hero.title === original.hero.title);
  await page.locator('[name="hero.primary_url"]').fill("/nuevos");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.getByText(/Guardado\. Ya se ve en la tienda/).waitFor({ timeout: 10000 });
  const saved = (await api("GET", "/admin/home", TOK)).json.data;
  check("el guardado llega a la API", saved.hero.title === "Calle con actitud" && saved.banners.length === 2 && saved.sections.length === 3 && saved.announcement.enabled, JSON.stringify({ t: saved.hero.title, b: saved.banners.length, s: saved.sections.map((x) => `${x.kind}:${x.product_slugs.length}`), a: saved.announcement.enabled }));
  const pub2 = (await api("GET", "/home", null)).json.data;
  check("la API pública resuelve la selección manual", pub2.sections.some((s) => s.kind === "PICKED" && s.products.length === 1 && s.products[0].slug.includes("gazelle")), JSON.stringify(pub2.sections.map((x) => `${x.kind}:${x.products.length}`)));
  check("la API pública trae aviso, foto y categorías", pub2.announcement?.text.startsWith("Envío gratis") && pub2.hero.image_url.startsWith("/uploads/") && pub2.categories?.items.length === 1);

  // ── Tienda (la portada se regenera cada 60 s)
  const shop = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CO" }); const sp = await shop.newPage();
  const errs = []; sp.on("pageerror", (e) => errs.push(e.message)); sp.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 150)));
  let seen = false;
  for (let i = 0; i < 16 && !seen; i++) { await sp.goto(W + "/"); seen = (await sp.locator("body").innerText()).toLowerCase().includes("calle con actitud"); if (!seen) await new Promise((r) => setTimeout(r, 5000)); }
  check("la tienda muestra el banner nuevo (≤ 80 s)", seen);
  const body = (await sp.locator("body").innerText()).toLowerCase(); // el CSS pone títulos y etiquetas en mayúsculas
  check("la tienda muestra el aviso", body.includes("envío gratis en compras desde $300.000"));
  check("la tienda muestra los banners", body.includes("zapatillas") && body.includes("camisetas"));
  check("la tienda muestra la fila elegida a mano", body.includes("elegidos por el equipo") && body.includes("gazelle"));
  check("la tienda muestra las categorías con foto", body.includes("zapatos"));
  // Las fotos fuera de pantalla son «lazy»: se recorre la página para que carguen y se espera con tope (nunca decode(), que puede no resolver).
  await sp.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await sp.waitForFunction(() => [...document.images].filter((i) => i.src.includes("/uploads/")).every((i) => i.complete), null, { timeout: 15000 }).catch(() => {});
  check("las fotos subidas cargan (no hay imágenes rotas)", await sp.evaluate(() => { const l = [...document.images].filter((i) => i.src.includes("/uploads/")); return l.length >= 4 && l.every((i) => i.complete && i.naturalWidth > 0); }));
  check("el enlace del banner va a /hombre", (await sp.locator('a[href="/hombre"]').count()) > 0);
  check("el título es el único h1", (await sp.locator("h1").count()) === 1);
  check("sin desborde horizontal en escritorio", await noH(sp));
  await sp.screenshot({ path: `${OUT}/home-desktop.png`, fullPage: true });
  const mob = await browser.newContext({ viewport: { width: 375, height: 800 }, locale: "es-CO" }); const mp = await mob.newPage();
  await mp.goto(W + "/"); await mp.waitForSelector("h1");
  check("sin desborde horizontal en 375 px", await noH(mp));
  await mp.screenshot({ path: `${OUT}/home-mobile.png`, fullPage: true });
  check("sin errores de consola en la portada", errs.length === 0, errs.join(" | ").slice(0, 200));

  // ── Filas vacías no se muestran; desactivar el hero lo oculta
  const none = { ...saved, hero: { ...saved.hero, enabled: false }, sections: [{ kind: "PICKED", enabled: true, title: "Vacía", subtitle: "", limit: 4, product_slugs: [], view_all_url: "" }, { kind: "FEATURED", enabled: false, title: "Apagada", subtitle: "", limit: 4, product_slugs: [], view_all_url: "" }] };
  await api("PUT", "/admin/home", TOK, none);
  const pub3 = (await api("GET", "/home")).json.data;
  check("una fila sin productos o apagada no se publica", pub3.sections.length === 0);
  check("el banner apagado no se publica", pub3.hero === null);
  // productos no publicados no salen en la portada
  await api("PUT", "/admin/home", TOK, { ...saved, sections: [{ kind: "PICKED", enabled: true, title: "x", subtitle: "", limit: 4, product_slugs: ["no-existe-xyz"], view_all_url: "" }] });
  check("un slug inexistente no rompe la portada", (await api("GET", "/home")).status === 200);
  await ctx.close(); await shop.close(); await mob.close();
} catch (e) {
  bad++; console.log("✘ EXCEPCIÓN", e.message);
} finally {
  await restore();
  await browser.close();
}
console.log(`\n${ok} OK, ${bad} fallos`);
process.exit(bad ? 1 : 0);
