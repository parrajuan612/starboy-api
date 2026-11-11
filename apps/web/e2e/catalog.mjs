import { chromium } from "playwright-core";
import { W, API, API_ROOT, CHROME, OUT, UPLOAD_DIR, sql } from "./env.mjs";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
let ok = 0, bad = 0;
const check = (n, c, x = "") => { (c ? ok++ : bad++); console.log(`${c ? "✔" : "✘"} ${n}${x !== "" ? "  → " + x : ""}`); };
const open = async (vp = { width: 1280, height: 900 }) => { const ctx = await browser.newContext({ viewport: vp, locale: "es-CO" }); const page = await ctx.newPage(); page.on("pageerror", e => console.log("PAGEERROR", e.message)); page.on("console", m => m.type() === "error" && !m.text().includes("404") && console.log("CONSOLE", m.text().slice(0, 200))); return { ctx, page }; };
const names = (page) => page.locator("article h3").allInnerTexts();
const prices = async (page) => (await page.locator("article").evaluateAll(as => as.map(a => Number(a.querySelector("span.tabular-nums, .body-strong")?.textContent.replace(/\D/g, "")))));
const count = async (page) => Number((await page.locator('[aria-live="polite"]', { hasText: /producto/ }).first().innerText()).match(/\d+/)[0]);

let { ctx, page } = await open();
console.log("══ GÉNERO (UNISEX incluido)");
await page.goto(W + "/hombre");
let n = await names(page);
check("HOMBRE: título y 12 tarjetas en la primera página", (await page.locator("h1").innerText()) === "HOMBRE" && n.length === 12, `total=${await count(page)}`);
check("HOMBRE total = 13 (hombre + unisex)", (await count(page)) === 13);
await page.goto(W + "/hombre?pagina=2"); n = await names(page);
check("HOMBRE pág. 2: la tarjeta restante", n.length === 1, n.join(","));
await page.goto(W + "/hombre?limit=50"); 
const all = [...await (async () => { const a = []; for (const pg of [1, 2]) { await page.goto(W + "/hombre" + (pg > 1 ? "?pagina=" + pg : "")); a.push(...await names(page)); } return a; })()];
check("HOMBRE incluye unisex (Jordan 4, Dunk, Hoodie)", ["Jordan 4 Retro", "Nike Dunk Low", "Essentials Hoodie"].every(x => all.includes(x)));
check("HOMBRE incluye masculino (Air Force 1, Cargo)", ["Nike Air Force 1 '07", "Essentials Cargo Pant"].every(x => all.includes(x)));
check("HOMBRE excluye femenino (Samba, Gazelle, Boxy Tee)", !all.some(x => /Samba|Gazelle|Boxy/.test(x)));
const w = []; for (const pg of [1, 2]) { await page.goto(W + "/mujer" + (pg > 1 ? "?pagina=" + pg : "")); w.push(...await names(page)); }
check("MUJER = 12 (mujer + unisex) y excluye masculino", w.length === 12 && w.includes("Adidas Samba OG") && w.includes("Jordan 4 Retro") && !w.some(x => /Air Force|Cargo|Windrunner|Air Max/.test(x)), w.length);

console.log("══ CATEGORÍAS");
await page.goto(W + "/hombre/zapatos/sneakers"); n = await names(page);
check("HOMBRE › Zapatos › Sneakers: solo sneakers", n.length > 0 && n.every(x => /Jordan 4|Dunk|Air Force|550|Air Max/.test(x)), n.join(" | "));
check("migas", (await page.getByRole("navigation", { name: "Migas de pan" }).innerText()).replace(/\s+/g, " ") === "Inicio / Hombre / Zapatos / Sneakers");
check("título = categoría", (await page.locator("h1").innerText()) === "SNEAKERS");
check("columna de categorías con la actual marcada", await page.locator('aside a[aria-current="page"]').first().innerText() === "Sneakers");
await page.goto(W + "/hombre/ropa/hoodies"); n = await names(page); check("hoodies", n.length === 1 && n[0] === "Essentials Hoodie", n.join());
await page.goto(W + "/hombre/ropa"); check("categoría raíz incluye sus hijas (Ropa)", (await count(page)) >= 4, String(await count(page)));
check("404: jerarquía inválida (/hombre/zapatos/hoodies)", (await ctx.request.get(W + "/hombre/zapatos/hoodies")).status() === 404);
check("404: categoría inexistente", (await ctx.request.get(W + "/hombre/zzz")).status() === 404);
await page.goto(W + "/accesorios"); n = await names(page); check("ACCESORIOS: 3 productos", n.length === 3, n.join(" | "));
await page.goto(W + "/accesorios/gorras"); n = await names(page); check("ACCESORIOS › Gorras", n.length === 1 && n[0] === "Jordan Pro Cap");
await page.goto(W + "/marcas/nike"); n = await names(page); check("MARCAS › Nike: solo Nike", n.length > 0 && n.every(x => /Nike/.test(x)), `${n.length} productos`);
check("404: marca inexistente", (await ctx.request.get(W + "/marcas/zzz")).status() === 404);

console.log("══ FILTROS (UI)");
await page.goto(W + "/hombre");
await page.locator("#d-marca").selectOption("nike");
await page.locator("#d-min").fill("400000"); await page.locator("#d-max").fill("600000");
await page.locator("aside").getByRole("button", { name: "Filtrar" }).click();
await page.waitForURL(/marca=nike/);
check("URL limpia (sin parámetros vacíos)", new URL(page.url()).search === "?marca=nike&min=400000&max=600000", new URL(page.url()).search);
let pr = await prices(page), br = await page.locator("article p.uppercase").allInnerTexts();
check("marca Nike y precio dentro del rango", br.length > 0 && br.every(b => b.toLowerCase() === "nike") && pr.every(p => p >= 400000 && p <= 600000), `${br.length} resultados, precios ${pr.join(",")}`);
check("chips de filtros aplicados", await page.getByRole("list", { name: "Filtros aplicados" }).locator("li").count() === 2);
await page.getByRole("link", { name: /Quitar filtro: Marca/ }).click(); await page.waitForURL(u => !u.search.includes("marca"));
check("quitar un chip conserva el otro", new URL(page.url()).search === "?min=400000&max=600000", new URL(page.url()).search);
await page.goto(W + "/hombre?min=900000&max=100000"); pr = await prices(page);
check("min > max se intercambian (sin error)", pr.length > 0 && pr.every(p => p >= 100000 && p <= 900000), pr.join(","));
await page.goto(W + "/hombre?min=99999999"); check("sin resultados: mensaje y botón «Quitar filtros»", await page.getByRole("heading", { name: "No encontramos productos" }).isVisible() && await page.getByRole("link", { name: "Quitar filtros" }).isVisible());
await page.goto(W + "/hombre?orden=zz&pagina=abc&marca=%3Cscript%3E&min=-5"); check("parámetros inválidos se ignoran", (await names(page)).length === 12);
await page.getByRole("link", { name: "Limpiar filtros" }).first().click();

console.log("══ ORDEN");
await page.goto(W + "/productos"); await page.locator("#sort-select").selectOption("precio-asc"); await page.waitForURL(/orden=precio-asc/);
pr = await prices(page); check("precio ↑", pr.length === 12 && pr.every((p, i) => i === 0 || p >= pr[i - 1]), pr.join(","));
await page.locator("#sort-select").selectOption("precio-desc"); await page.waitForURL(/orden=precio-desc/);
pr = await prices(page); check("precio ↓", pr.every((p, i) => i === 0 || p <= pr[i - 1]), pr.slice(0, 5).join(","));
check("el orden se conserva en la paginación", (await page.getByRole("link", { name: "Ir a la página 2" }).getAttribute("href")).includes("orden=precio-desc"));
await page.getByRole("link", { name: "Ir a la página 2" }).click(); await page.waitForURL(/pagina=2/);
check("paginación: página 2 con 5 productos y página actual marcada", (await names(page)).length === 5 && await page.locator('nav[aria-label="Paginación"] [aria-current="page"]').innerText() === "2");

console.log("══ BÚSQUEDA");
await page.goto(W + "/buscar?q=jordan"); n = await names(page); check("buscar «jordan»", n.length >= 3 && n.every(x => /Jordan/.test(x)), n.join(" | "));
await page.goto(W + "/buscar"); check("sin término: invita a buscar", await page.getByText("Escribe qué buscas").isVisible());

console.log("══ TARJETA");
await page.goto(W + "/productos?orden=precio-desc");
const dunk = page.locator("article", { hasText: "Nike Dunk Low" });
check("badge de descuento -17%", await dunk.locator(".sb-badge--discount").innerText() === "-17%");
check("precio tachado + final", (await dunk.locator("s").innerText()).includes("699.900") && (await dunk.innerText()).includes("579.900"));
check("badge Nuevo", await page.locator("article", { hasText: "Jordan 4 Retro" }).getByText("Nuevo").isVisible());
check("badge Agotado (con texto)", await page.locator("article", { hasText: "Gazelle" }).getByText("Agotado").isVisible());
check("sin sombra y sin radio (manual)", await dunk.evaluate(e => getComputedStyle(e).boxShadow === "none" && getComputedStyle(e).borderRadius === "0px"));
const imgs = dunk.locator("img"); const [o1, o2] = [await imgs.nth(0).evaluate(e => getComputedStyle(e).opacity), await imgs.nth(1).evaluate(e => getComputedStyle(e).opacity)];
await dunk.hover(); await page.waitForTimeout(350);
const [h1, h2] = [await imgs.nth(0).evaluate(e => getComputedStyle(e).opacity), await imgs.nth(1).evaluate(e => getComputedStyle(e).opacity)];
check("hover cambia a la segunda foto", o1 === "1" && o2 === "0" && h1 === "0" && h2 === "1", `${o1}/${o2} → ${h1}/${h2}`);
check("toda la tarjeta es un enlace a /producto/…", await dunk.locator("a").first().evaluate(a => a.getAttribute("href") + "|" + getComputedStyle(a, "::after").position) === "/producto/demo-nike-dunk-low-panda|absolute");
check("todas las imágenes cargan", await page.locator("article img").evaluateAll(is => is.filter(i => i.complete && i.naturalWidth === 0).length) === 0);

console.log("══ FICHA DE PRODUCTO");
await page.goto(W + "/producto/demo-jordan-4-retro-white-oreo");
check("título de pestaña", (await page.title()).startsWith("Jordan Jordan 4 Retro White Oreo"), await page.title());
check("migas (unisex → Productos)", (await page.getByRole("navigation", { name: "Migas de pan" }).innerText()).replace(/\s+/g, " ") === "Inicio / Productos / Zapatos / Sneakers / Jordan 4 Retro");
const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
check("JSON-LD Product (COP, disponibilidad)", ld["@type"] === "Product" && ld.offers.priceCurrency === "COP" && ld.offers.price === 1249900 && ld.offers.availability.endsWith("InStock") && ld.image.length === 4);
const thumbs = page.getByRole("list", { name: "Miniaturas" }).locator("button");
check("galería: 4 miniaturas ordenadas por posición", await thumbs.count() === 4);
const alts = await page.locator('[aria-roledescription="foto"] img').evaluateAll(is => is.map(i => i.alt));
check("orden de fotos: lateral, superior, trasera, detalle", ["lateral", "superior", "trasera", "detalle"].every((v, i) => alts[i].includes(v)), alts.map(a => a.split("vista ")[1]).join(","));
await thumbs.nth(2).click(); await page.waitForTimeout(700);
check("miniatura activa cambia (aria-current) y el carrusel avanza", await thumbs.nth(2).getAttribute("aria-current") === "true" && await page.locator(".sb-gallery-track").evaluate(e => e.scrollLeft > e.clientWidth), "");
await page.getByRole("button", { name: "Foto siguiente" }).click(); await page.waitForTimeout(700);
check("flecha siguiente", await thumbs.nth(3).getAttribute("aria-current") === "true");
const price = await page.locator("main .price-lg").innerText(); check("precio PDP", price.replace(/\D/g, "") === "1249900", price);

console.log("— Tallas y disponibilidad");
const group = page.getByRole("group", { name: /Talla/ });
const chips = group.locator("button"); check("7 tallas", await chips.count() === 7);
const sold = group.getByRole("button", { name: "Talla 40, agotada" });
check("talla sin stock: aria-disabled, tachada y deshabilitada", await sold.getAttribute("aria-disabled") === "true" && (await sold.evaluate(e => getComputedStyle(e).textDecorationLine)) === "line-through");
await sold.click({ force: true }); check("clic en agotada no la selecciona", await sold.getAttribute("aria-pressed") === "false");
await page.getByRole("button", { name: "Agregar al carrito" }).click();
check("sin talla: pide elegirla y mueve el foco", await page.getByText("Elige tu talla para continuar.").isVisible() && await page.evaluate(() => document.activeElement?.closest(".sb-size-selector") !== null));
await group.getByRole("button", { name: "Talla 43" }).click();
check("talla con 1 unidad: «¡Última unidad!»", await page.getByText("¡Última unidad!").isVisible());
await group.getByRole("button", { name: "Talla 41" }).click();
check("talla con 2: «¡Últimas 2 unidades!»", await page.getByText("¡Últimas 2 unidades!").isVisible());
await group.getByRole("button", { name: "Talla 38" }).click();
check("talla seleccionada invertida (brand)", await group.getByRole("button", { name: "Talla 38" }).evaluate(e => getComputedStyle(e).backgroundColor) === "rgb(24, 32, 98)");
check("talla con stock suficiente: «En stock»", await page.getByText("En stock", { exact: true }).isVisible());

console.log("— Carrito (límite por línea y por stock)");
const plus = page.getByRole("button", { name: "Agregar una unidad" });
for (let i = 0; i < 6; i++) if (await plus.isEnabled()) await plus.click();
check("cantidad tope = stock de la talla (4)", await page.locator("output").innerText() === "4" && await plus.isDisabled());
await page.getByRole("button", { name: "Agregar al carrito" }).click();
const cart = () => page.evaluate(() => JSON.parse(localStorage.getItem("sb-cart")).state.lines);
let lines = await cart();
check("Zustand: línea con 4 unidades de la talla 38", lines.length === 1 && lines[0].quantity === 4 && lines[0].size === "38" && lines[0].unitPriceCOP === 1249900 && lines[0].productSlug === "demo-jordan-4-retro-white-oreo", JSON.stringify(lines[0]).slice(0, 150));
check("mensaje de confirmación con enlace al carrito", await page.getByText(/Agregaste 4 unidades \(talla 38\)/).isVisible() && await page.getByRole("link", { name: "Ver carrito" }).isVisible());
check("badge del header = 4", await page.getByRole("button", { name: /Carrito, 4 productos/ }).isVisible());
await page.getByRole("button", { name: "Agregar al carrito" }).click();
check("ya tiene todas las unidades de la talla → mensaje, sin agregar", await page.getByText(/todas las unidades disponibles de esta talla \(4\)/).isVisible() && (await cart())[0].quantity === 4);

await page.goto(W + "/producto/demo-essentials-hoodie-negro");
await page.getByRole("group", { name: /Talla/ }).getByRole("button", { name: "Talla M", exact: true }).click(); // stock 10
for (let i = 0; i < 12; i++) if (await page.getByRole("button", { name: "Agregar una unidad" }).isEnabled()) await page.getByRole("button", { name: "Agregar una unidad" }).click();
check("cantidad tope = 10 por línea", await page.locator("output").innerText() === "10");
await page.getByRole("button", { name: "Agregar al carrito" }).click();
lines = await cart(); check("línea de 10 unidades", lines.find(l => l.size === "M")?.quantity === 10);
await page.getByRole("button", { name: "Agregar al carrito" }).click();
check("más de 10 en total: bloqueado con mensaje", await page.getByText(/el máximo por producto es 10/).isVisible() && (await cart()).find(l => l.size === "M").quantity === 10);

console.log("— Disponibilidad en vivo");
await page.goto(W + "/producto/demo-nike-dunk-low-panda");
await page.getByRole("group", { name: /Talla/ }).getByRole("button", { name: "Talla 41", exact: true }).click();
check("antes: talla 41 en stock", await page.getByText("En stock", { exact: true }).isVisible());
sql("update product_variants set stock_on_hand = 0 where sku = 'DEMO-NIKE-DUNK-LOW-PANDA-41'");
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await page.getByText("Esa talla se acaba de agotar. Elige otra.").waitFor({ timeout: 5000 });
check("otro cliente la agota: la ficha lo detecta, deselecciona y avisa", await page.getByRole("button", { name: "Talla 41, agotada" }).getAttribute("aria-disabled") === "true");
sql("update product_variants set stock_on_hand = 3 where sku = 'DEMO-NIKE-DUNK-LOW-PANDA-41'");  // 3 era el valor sembrado para esa talla (6,4,8,3,0,2,5 → 41=3)
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await page.waitForTimeout(600);
check("al reponerse vuelve a estar disponible", await page.getByRole("button", { name: "Talla 41", exact: true }).getAttribute("aria-disabled") === null);
check("promoción en la ficha: -17% y precio tachado", await page.locator(".sb-badge--discount").first().innerText() === "-17%" && (await page.locator("main s").first().innerText()).includes("699.900"));

console.log("— Agotado y errores");
await page.goto(W + "/producto/demo-adidas-gazelle-bold");
const btn = page.getByRole("button", { name: "Agotado" }); check("producto agotado: botón deshabilitado", await btn.isDisabled() && await page.getByText("Agotado por ahora").isVisible());
check("todas las tallas agotadas", await page.getByRole("group", { name: /Talla/ }).locator('button[aria-disabled="true"]').count() === 5);
check("404 de producto inexistente", (await ctx.request.get(W + "/producto/no-existe")).status() === 404);
await page.goto(W + "/producto/demo-nike-air-force-1-triple-white");
check("migas con género (Hombre)", (await page.getByRole("navigation", { name: "Migas de pan" }).innerText()).replace(/\s+/g, " ") === "Inicio / Hombre / Zapatos / Sneakers / Nike Air Force 1 '07");
check("producto importado: etiqueta", true);
await ctx.close();

console.log("\n══ MÓVIL 375");
({ ctx, page } = await open({ width: 375, height: 780 }));
await page.goto(W + "/hombre");
check("sin scroll horizontal", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
check("grilla de 2 columnas", await page.locator("ul.grid li").evaluateAll(l => new Set(l.map(e => Math.round(e.getBoundingClientRect().left))).size) === 2);
check("columna lateral oculta; botón Filtros visible", !(await page.locator("aside").isVisible()) && await page.getByRole("button", { name: /Filtros/ }).isVisible());
await page.getByRole("button", { name: /Filtros/ }).click();
const dlg = page.locator("dialog.sb-filterdrawer"); await dlg.waitFor();
check("drawer de filtros abre y no desborda", await dlg.evaluate(d => d.open && d.scrollWidth <= d.clientWidth));
await dlg.locator("#m-marca").selectOption("jordan"); await dlg.getByRole("button", { name: "Filtrar" }).click();
await page.waitForURL(/marca=jordan/);
check("filtrar desde el drawer: aplica y cierra", !(await dlg.evaluate(d => d.open)) && (await page.locator("article p.uppercase").allInnerTexts()).every(b => b === "JORDAN" || b.toLowerCase() === "jordan"));
check("el botón muestra filtros activos «Filtros (1)»", await page.getByRole("button", { name: "Filtros (1)" }).isVisible());
await page.getByRole("button", { name: /Filtros/ }).click(); await dlg.getByRole("link", { name: "Limpiar filtros" }).click(); await page.waitForURL(u => !u.search);
check("«Limpiar filtros» cierra y limpia", !(await dlg.evaluate(d => d.open)));
await page.getByRole("button", { name: /Filtros/ }).click(); await page.keyboard.press("Escape"); check("Escape cierra el drawer", !(await dlg.evaluate(d => d.open)));
const small = await page.locator("main button:visible, main select:visible, main nav[aria-label='Paginación'] a:visible").evaluateAll(es => es.filter(e => e.getBoundingClientRect().height < 44).map(e => e.textContent.trim() || e.getAttribute("aria-label")));
check("controles del catálogo ≥ 44px", small.length === 0, small.join(","));
await page.screenshot({ path: OUT + "/m-catalogo.png" });
await page.goto(W + "/producto/demo-jordan-4-retro-white-oreo");
check("PDP sin scroll horizontal", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
await page.locator(".sb-gallery-track").evaluate(e => e.scrollTo({ left: e.clientWidth * 2, behavior: "instant" })); await page.waitForTimeout(400);
check("deslizar la galería actualiza el contador (3 / 4) y la miniatura", await page.getByText("3 / 4").isVisible() && await page.getByRole("button", { name: "Ver foto 3" }).getAttribute("aria-current") === "true");
const tiny = await page.locator("main button:visible").evaluateAll(es => es.filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map(e => e.getAttribute("aria-label") || e.textContent.trim()));
check("tallas, cantidad y botón ≥ 44px", tiny.length === 0, tiny.join(","));
await page.screenshot({ path: OUT + "/m-producto.png", fullPage: false });
await ctx.close();

console.log("\n══ Anchos: sin scroll horizontal");
for (const wd of [320, 375, 768, 1024, 1280, 1536]) { const c = await open({ width: wd, height: 800 }); const bad2 = []; for (const p of ["/hombre", "/mujer/ropa", "/productos?pagina=2", "/marcas/nike", "/buscar?q=nike", "/producto/demo-nike-dunk-low-panda", "/producto/demo-adidas-gazelle-bold"]) { await c.page.goto(W + p); if (await c.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) bad2.push(p); } check(`ancho ${wd}px`, bad2.length === 0, bad2.join(" ")); await c.ctx.close(); }

console.log("\n══ Escritorio: capturas");
({ ctx, page } = await open()); await page.goto(W + "/hombre"); await page.screenshot({ path: OUT + "/d-catalogo.png" });
await page.goto(W + "/producto/demo-nike-dunk-low-panda"); await page.getByRole("group", { name: /Talla/ }).getByRole("button", { name: "Talla 40", exact: true }).click(); await page.waitForTimeout(300); await page.screenshot({ path: OUT + "/d-producto.png" });
console.log(`\n${ok} OK, ${bad} fallos`); await browser.close();
