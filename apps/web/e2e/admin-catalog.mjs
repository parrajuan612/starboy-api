import { chromium } from "playwright-core";
import { W, API, API_ROOT, CHROME, OUT, UPLOAD_DIR, sql } from "./env.mjs";
import { existsSync, readdirSync, writeFileSync } from "fs";

const UPLOADS = UPLOAD_DIR;
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
let ok = 0, bad = 0;
const check = (n, c, x = "") => { (c ? ok++ : bad++); console.log(`${c ? "✔" : "✘"} ${n}${x !== "" ? "  → " + x : ""}`); };
const api = async (method, path, token, body) => {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); return { status: r.status, json: t ? JSON.parse(t) : null };
};
const upload = async (token, bytes, name = "foto.png", type = "image/png") => {
  const fd = new FormData(); fd.append("file", new Blob([bytes], { type }), name);
  const r = await fetch(API + "/admin/uploads", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  const t = await r.text(); return { status: r.status, json: t ? JSON.parse(t) : null };
};
const authTimes = [];
const throttle = async () => { const now = Date.now(); while (authTimes.length && now - authTimes[0] > 61000) authTimes.shift(); if (authTimes.length >= 9) { await new Promise((r) => setTimeout(r, 61000 - (now - authTimes[0]))); authTimes.shift(); } authTimes.push(Date.now()); };
const loginApi = async (email, password) => { await throttle(); return (await api("POST", "/auth/login", null, { email, password })).json.data.access_token; };
const asUser = async (email, password, vp = { width: 1280, height: 900 }) => {
  await throttle();
  const ctx = await browser.newContext({ viewport: vp, locale: "es-CO" }); const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => m.type() === "error" && !/40[134]|409|422|429|Failed to load resource/.test(m.text()) && console.log("CONSOLE", m.text().slice(0, 200)));
  await page.goto(W + "/login"); await page.locator('[name="email"]').fill(email); await page.locator('[name="password"]').fill(password);
  await page.getByRole("button", { name: /Entrar|Iniciar sesión|Ingresar/i }).first().click(); await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  return { ctx, page };
};
const noH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const txt = (page) => page.locator("main").innerText();
const focusName = (page) => page.evaluate(() => document.activeElement?.getAttribute("name"));
const cop = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n).replace(/\s/g, " ");

// PNG válido de 1×1 (con relleno distinto para que cada archivo sea único)
const PNG = (n = 0) => Buffer.concat([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"), Buffer.from([n])]);
const pngFile = (n) => { const p = `${OUT}/foto-${n}.png`; writeFileSync(p, PNG(n)); return p; };

const TEST_SLUG_PREFIX = "starboy-prueba";
let ADMIN_TOK, originalRates = [], originalTRM;
const cleanup = async () => {
  try {
    if (originalTRM !== undefined) await api("PUT", "/admin/settings", ADMIN_TOK, { values: { exchange_rate_cop: originalTRM } });
    for (const r of originalRates) await api("PATCH", `/admin/import-rates/${r.id}`, ADMIN_TOK, { freight_cop: r.freight_cop, handling_cop: r.handling_cop, insurance_cop: r.insurance_cop, national_delivery_cop: r.national_delivery_cop, margin_cop: r.margin_cop });
  } catch (e) { console.log("cleanup:", e.message); }
};

try {
  ADMIN_TOK = await loginApi("admin@starboy.local", "una-clave-larga-segura");
  originalRates = (await api("GET", "/admin/import-rates", ADMIN_TOK)).json.data;
  originalTRM = (await api("GET", "/admin/settings", ADMIN_TOK)).json.data.find((s) => s.key === "exchange_rate_cop").value;

  console.log("══ 1. API: AJUSTES");
  {
    const s = await api("GET", "/admin/settings", ADMIN_TOK);
    check("lista los 9 parámetros con etiqueta, unidad y rango", s.status === 200 && s.json.data.length === 9 && s.json.data.every((x) => x.label && "min" in x && "max" in x && typeof x.value === "number"));
    const bad = await api("PUT", "/admin/settings", ADMIN_TOK, { values: { vat_percent: 150, exchange_rate_cop: 4300 } });
    check("valor fuera de rango → 422 por campo", bad.status === 422 && !!bad.json.error.details?.vat_percent, JSON.stringify(bad.json.error?.details));
    check("…y no se guardó NINGUNO (todo o nada)", (await api("GET", "/admin/settings", ADMIN_TOK)).json.data.find((x) => x.key === "exchange_rate_cop").value === originalTRM);
    check("clave desconocida → 422", (await api("PUT", "/admin/settings", ADMIN_TOK, { values: { inventada: 1 } })).status === 422);
    check("sin sesión → 401", (await api("GET", "/admin/settings")).status === 401);
  }

  console.log("══ 2. API: SUBIDA DE FOTOS");
  {
    check("sin sesión → 401", (await upload(null, PNG(1))).status === 401);
    const up = await upload(ADMIN_TOK, PNG(2));
    check("PNG válido → 201 con url /uploads/… y public_id local/…", up.status === 201 && /^\/uploads\/[0-9a-f-]{36}\.png$/.test(up.json.data.url) && up.json.data.public_id.startsWith("local/"), JSON.stringify(up.json.data));
    const file = up.json.data.url.replace("/uploads/", "");
    check("el archivo quedó en la carpeta de fotos", existsSync(`${UPLOADS}/${file}`));
    const direct = await fetch(API_ROOT + up.json.data.url);
    check("se sirve desde la API con tipo image/png y nosniff", direct.status === 200 && direct.headers.get("content-type") === "image/png" && direct.headers.get("x-content-type-options") === "nosniff");
    const viaWeb = await fetch(W + up.json.data.url);
    check("…y también desde la web (reenvío /uploads)", viaWeb.status === 200 && viaWeb.headers.get("content-type") === "image/png");
    check("no lista la carpeta", (await fetch(API_ROOT + "/uploads/")).status !== 200 || !/<a href/.test(await (await fetch(API_ROOT + "/uploads/")).text()));
    const html = await upload(ADMIN_TOK, Buffer.from("<script>alert(1)</script>"), "x.png", "image/png");
    check("HTML disfrazado de .png → 422 (se mira el contenido)", html.status === 422, html.json?.error?.details?.file);
    const big = await upload(ADMIN_TOK, Buffer.concat([PNG(3), Buffer.alloc(6 * 1024 * 1024)]));
    check("más de 5 MB → 422", big.status === 422 && /5 MB/.test(big.json.error.details.file));
    check("sin archivo → 422", (await fetch(API + "/admin/uploads", { method: "POST", headers: { Authorization: `Bearer ${ADMIN_TOK}` }, body: new FormData() })).status === 422);
    check("los rechazos no dejaron archivos", readdirSync(UPLOADS).length === 1);
  }

  console.log("══ 3. PERMISOS (STAFF no gestiona catálogo)");
  let staff;
  {
    await throttle();
    const email = `s8staff${Date.now()}@example.com`;
    const reg = await api("POST", "/auth/register", null, { email, password: "clave-segura-1", full_name: "Equipo Staff" });
    sql(`update users set role='STAFF' where email='${email}'`);
    staff = { email, id: reg.json.data.user.id, token: await loginApi(email, "clave-segura-1") };
    check("STAFF: GET /admin/settings → 403", (await api("GET", "/admin/settings", staff.token)).status === 403);
    check("STAFF: POST /admin/uploads → 403", (await upload(staff.token, PNG(4))).status === 403);
    check("STAFF: crear producto → 403", (await api("POST", "/admin/products", staff.token, {})).status === 403);
    const { ctx, page } = await asUser(staff.email, "clave-segura-1");
    await page.goto(W + "/admin");
    const nav = await page.locator('aside nav[aria-label="Panel"]').innerText();
    check("STAFF: el menú NO muestra Productos, Catálogo ni Ajustes", !/Productos|Catálogo|Ajustes/i.test(nav) && /Órdenes/i.test(nav), nav.replace(/\n/g, " | "));
    await page.goto(W + "/admin/productos");
    check("STAFF: /admin/productos → «Sin acceso»", await page.getByText("Sin acceso").count() === 1);
    await ctx.close();
  }

  console.log("══ 4. CATÁLOGO: MARCAS Y CATEGORÍAS (UI, ADMIN)");
  const { ctx, page } = await asUser("admin@starboy.local", "una-clave-larga-segura");
  const stamp = Date.now().toString().slice(-6);
  const BRAND = `Marca Prueba ${stamp}`, CAT = `Categoría Prueba ${stamp}`, SUB = `Sub Prueba ${stamp}`;
  {
    await page.goto(W + "/admin");
    const nav = await page.locator('aside nav[aria-label="Panel"]').innerText();
    check("ADMIN: el menú muestra Productos, Catálogo y Ajustes", /Productos/i.test(nav) && /Catálogo/i.test(nav) && /Ajustes/i.test(nav));
    await page.goto(W + "/admin/catalogo"); await page.getByRole("tab", { name: "Marcas" }).waitFor();
    await page.locator('[name="brand-name"]').fill(""); await page.getByRole("button", { name: "Agregar" }).click();
    check("marca vacía: error", await page.getByText(/Escribe el nombre de la marca/).count() === 1);
    await page.locator('[name="brand-name"]').fill(BRAND); await page.getByRole("button", { name: "Agregar" }).click();
    await page.locator('ul[aria-label="Marcas"]').getByText(BRAND).first().waitFor();
    check("marca creada y listada", sql(`select count(*) from brands where name='${BRAND}'`) === "1");
    await page.locator('[name="brand-name"]').fill(BRAND); await page.getByRole("button", { name: "Agregar" }).click();
    await page.waitForTimeout(600);
    check("marca duplicada: mensaje de la API, sin duplicar", sql(`select count(*) from brands where name='${BRAND}'`) === "1" && await page.locator('main [role="alert"], main .sb-field-error').count() >= 1);
    const row = page.locator('ul[aria-label="Marcas"] li', { hasText: BRAND });
    await row.getByRole("button", { name: "Desactivar" }).click(); await row.getByText("Inactiva").waitFor();
    check("desactivar marca", sql(`select is_active from brands where name='${BRAND}'`) === "f");
    await row.getByRole("button", { name: "Activar" }).click(); await row.getByText("Inactiva").waitFor({ state: "detached" });
    await page.getByRole("tab", { name: "Categorías" }).click();
    await page.locator('[name="cat-name"]').fill(CAT); await page.getByRole("button", { name: "Agregar" }).click(); await page.locator('ul[aria-label="Categorías"]').getByText(CAT).first().waitFor();
    await page.locator('[name="cat-name"]').fill(SUB); await page.locator('[name="cat-parent"]').selectOption({ label: CAT }); await page.getByRole("button", { name: "Agregar" }).click();
    await page.locator('ul[aria-label="Categorías"]').getByText(SUB).first().waitFor();
    check("categoría y subcategoría (anidada) creadas", sql(`select count(*) from categories c join categories p on p.id=c.parent_id where c.name='${SUB}' and p.name='${CAT}'`) === "1");
    const catRow = page.locator('ul[aria-label="Categorías"] li', { hasText: CAT }).first();
    await catRow.getByRole("button", { name: "Editar" }).first().click();
    await page.locator('input[name^="cn-"]').fill(CAT + " ✎"); await page.getByRole("button", { name: "Guardar", exact: true }).click(); // solo hay una fila en edición
    await page.locator('ul[aria-label="Categorías"]').getByText(CAT + " ✎").first().waitFor();
    check("editar nombre de categoría", sql(`select count(*) from categories where name='${CAT} ✎'`) === "1");
    check("375px: catálogo sin scroll horizontal", await (async () => { await page.setViewportSize({ width: 375, height: 800 }); const r = await noH(page); await page.setViewportSize({ width: 1280, height: 900 }); return r; })());
  }

  console.log("══ 5. PRODUCTO: CREAR, TALLAS, FOTOS, PUBLICAR");
  let productId, slug;
  const PNAME = `Zapatilla Prueba ${stamp}`;
  {
    await page.goto(W + "/admin/productos"); await page.getByRole("link", { name: /Nuevo producto/ }).first().click();
    await page.waitForURL(/productos\/nuevo/); await page.waitForFunction(() => document.querySelectorAll('[name="brand_id"] option').length > 1);
    await page.getByRole("button", { name: "Crear producto" }).click();
    await page.waitForTimeout(300); const errs = await page.locator('form [aria-invalid="true"]').count();
    check("vacío: errores en nombre, marca, categoría y precio, con foco", errs === 4 && (await focusName(page)) === "name", String(errs));
    await page.locator('[name="name"]').fill(PNAME);
    await page.locator('[name="brand_id"]').selectOption({ label: BRAND });
    check("categoría: la subcategoría aparece agrupada bajo su padre", await page.locator('[name="category_id"] optgroup').count() >= 1);
    await page.locator('[name="category_id"]').selectOption({ label: SUB });
    await page.locator('[name="base_price"]').fill("399.900");
    await page.locator('[name="compare_at"]').fill("300000");
    await page.getByRole("button", { name: "Crear producto" }).click();
    check("precio tachado menor al de venta: error claro", /mayor que el precio de venta/.test(await page.locator("form").innerText()));
    await page.locator('[name="compare_at"]').fill("499900");
    await page.locator('[name="cost"]').fill("250000");
    await page.locator('[name="colorway"]').fill("White Oreo");
    await page.locator('textarea[name="description"]').fill("Prueba automática.");
    await page.getByRole("button", { name: "Crear producto" }).click();
    await page.waitForURL(/productos\/[0-9a-f-]{36}\?nuevo=1/, { timeout: 15000 });
    productId = page.url().match(/productos\/([0-9a-f-]{36})/)[1];
    await page.getByText(/Producto creado como borrador/).waitFor();
    slug = sql(`select slug from products where id='${productId}'`);
    check("creado como BORRADOR con precio 399900, tachado 499900 y costo 250000", sql(`select status||'|'||base_price_cop||'|'||compare_at_price_cop||'|'||cost_cop from products where id='${productId}'`) === "DRAFT|399900|499900|250000");
    check("no se ve en la tienda mientras es borrador (404)", (await api("GET", `/products/${slug}`)).status === 404);
    check("«Publicar» deshabilitado: faltan fotos y tallas", await page.getByRole("button", { name: "Publicar en la tienda" }).isDisabled());

    // tallas
    await page.waitForSelector('[name="sizes"]');
    await page.locator('[name="sizes"]').fill("");
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    check("sin tallas: error de campo", await page.getByText(/Escribe al menos una talla/).count() === 1);
    await page.locator('[name="sizes"]').fill("40, 41, 42"); await page.locator('[name="stock"]').fill("5");
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await page.locator('ul[aria-label="Tallas del producto"] > li').nth(2).waitFor();
    check("3 tallas creadas de una vez con 5 unidades y SKU con prefijo", sql(`select count(*)||'|'||min(sku) from product_variants where product_id='${productId}' and stock_on_hand=5`) === "3|ZAPATILLA-PRUEBA-" + stamp + "-40", sql(`select min(sku) from product_variants where product_id='${productId}'`));
    await page.locator('[name="sizes"]').fill("40"); await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await page.getByText(/Talla 40:/).waitFor();
    check("talla repetida: mensaje y sin duplicar", sql(`select count(*) from product_variants where product_id='${productId}'`) === "3");
    // editar stock
    const v41 = sql(`select id from product_variants where product_id='${productId}' and size='41'`);
    await page.locator(`[name="stock-${v41}"]`).fill("12"); await page.locator(`[name="price-${v41}"]`).fill("420000");
    await page.locator('ul[aria-label="Tallas del producto"] > li', { hasText: "Talla 41" }).getByRole("button", { name: "Guardar talla" }).click();
    await page.getByText("Guardado.").waitFor();
    check("editar stock y precio propio de una talla", sql(`select stock_on_hand||'|'||price_override_cop from product_variants where id='${v41}'`) === "12|420000");
    check("el cambio de stock quedó en la bitácora inmutable (ADJUSTMENT)", Number(sql(`select count(*) from inventory_movements where variant_id='${v41}'`)) >= 1, sql(`select type||' '||delta_on_hand from inventory_movements where variant_id='${v41}' order by created_at desc limit 1`));
    await page.locator(`[name="stock-${v41}"]`).fill("abc"); await page.locator('ul[aria-label="Tallas del producto"] > li', { hasText: "Talla 41" }).getByRole("button", { name: "Guardar talla" }).click();
    check("stock inválido: error en pantalla", await page.getByText(/número entero/).count() >= 1);
    await page.locator(`[name="stock-${v41}"]`).fill("12");

    // fotos
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([pngFile(11), pngFile(12), pngFile(13)]);
    await page.getByText(/Faltan 1 foto/).first().waitFor({ timeout: 20000 });
    check("3 fotos subidas: «Faltan 1 foto» y Publicar sigue deshabilitado", await page.getByRole("button", { name: "Publicar en la tienda" }).isDisabled());
    check("la primera es la «Principal»", await page.locator('ul[aria-label="Fotos del producto"] li').first().getByText("Principal").count() === 1);
    check("BD: 3 fotos con ruta /uploads/ y public_id local/", sql(`select count(*) from product_images where product_id='${productId}' and url like '/uploads/%' and public_id like 'local/%'`) === "3");
    await fileInput.setInputFiles([{ name: "malo.png", mimeType: "image/png", buffer: Buffer.from("<html>no soy foto</html>") }]);
    await page.getByText(/malo.png:/).waitFor({ timeout: 15000 });
    check("archivo que no es foto: error por archivo, sin registrar nada", sql(`select count(*) from product_images where product_id='${productId}'`) === "3");
    await fileInput.setInputFiles([{ name: "doc.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }]);
    await page.getByText(/solo se aceptan fotos/i).waitFor();
    await fileInput.setInputFiles([pngFile(14)]);
    await page.getByText(/4 fotos: listo para publicar/).waitFor({ timeout: 20000 });
    check("4 fotos: «listo para publicar»", true);
    // reordenar
    const firstBefore = sql(`select id from product_images where product_id='${productId}' order by position limit 1`);
    await page.getByRole("button", { name: "Mover la foto 1 a la derecha" }).click();
    await page.waitForTimeout(800);
    check("mover la foto 1 a la derecha cambia la principal", sql(`select id from product_images where product_id='${productId}' order by position limit 1`) !== firstBefore);

    // publicar
    await page.getByRole("button", { name: "Publicar en la tienda" }).click();
    await page.locator(".sb-badge", { hasText: "Publicado" }).first().waitFor();
    check("publicado: ACTIVE con fecha de publicación", sql(`select status||'|'||(published_at is not null) from products where id='${productId}'`) === "ACTIVE|true");
    const pub = await api("GET", `/products/${slug}`);
    check("la tienda ya lo sirve con 3 tallas, 4 fotos y el precio tachado", pub.status === 200 && pub.json.data.variants.length === 3 && pub.json.data.images.length === 4 && pub.json.data.compare_at_price_cop === 499900, `${pub.status}`);
    check("la API pública NO expone el costo", !JSON.stringify(pub.json.data).includes("250000"));
    const shop = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CO" }); const sp = await shop.newPage();
    await sp.goto(W + `/producto/${slug}`); await sp.getByRole("heading", { name: PNAME }).waitFor();
    check("la página de producto de la tienda lo muestra (nombre, precio, tallas)", /399\.900/.test(await sp.locator("main").innerText()) && /\b4[012]\b/.test(await sp.locator("main").innerText()));
    check("la foto subida se ve (carga real, no rota)", await sp.evaluate(async () => { const img = [...document.images].find((i) => i.src.includes("/uploads/")); if (!img) return false; await img.decode().catch(() => {}); return img.naturalWidth > 0; }));
    await shop.close();
    // no bajar de 4 fotos publicado
    await page.locator('ul[aria-label="Fotos del producto"] li').first().getByRole("button", { name: /Eliminar la foto 1/ }).click();
    await page.getByRole("button", { name: "Sí, eliminar" }).click();
    await page.getByText(/foto/i).filter({ hasText: /mínimo|al menos|necesit/i }).first().waitFor({ timeout: 8000 }).catch(() => {});
    check("publicado: no deja bajar de 4 fotos (la API lo impide)", sql(`select count(*) from product_images where product_id='${productId}'`) === "4");
    // 375
    check("375px: editor de producto (tallas + fotos) sin scroll horizontal", await (async () => { await page.setViewportSize({ width: 375, height: 800 }); await page.waitForTimeout(300); const r = await noH(page); await page.screenshot({ path: OUT + "/s8-producto-movil.png", fullPage: true }); await page.setViewportSize({ width: 1280, height: 900 }); return r; })());
    // despublicar, borrar foto → archivo en disco desaparece
    await page.getByRole("button", { name: "Pasar a borrador" }).click(); await page.locator(".sb-badge", { hasText: "Borrador" }).first().waitFor();
    check("pasar a borrador lo saca de la tienda (404)", (await api("GET", `/products/${slug}`)).status === 404);
    const before = readdirSync(UPLOADS).length;
    await page.locator('ul[aria-label="Fotos del producto"] li').first().getByRole("button", { name: /Eliminar la foto 1/ }).click();
    await page.getByRole("button", { name: "Sí, eliminar" }).click();
    await page.getByText(/Faltan 1 foto/).first().waitFor();
    check("eliminar una foto borra también el archivo del disco", readdirSync(UPLOADS).length === before - 1, `${before} → ${readdirSync(UPLOADS).length}`);
    // editar datos
    await page.locator('[name="base_price"]').fill("379900"); await page.getByRole("button", { name: "Guardar cambios" }).click(); await page.getByText("Cambios guardados.").waitFor();
    check("editar el precio de venta", sql(`select base_price_cop from products where id='${productId}'`) === "379900");
  }

  console.log("══ 6. LISTA Y INVENTARIO");
  {
    await page.goto(W + "/admin/productos"); await page.locator('input[type="search"]').fill(PNAME); await page.waitForTimeout(1200);
    const li = page.locator('ul[aria-label="Lista de productos"] > li'); await li.first().waitFor();
    check("el buscador encuentra el producto, con «Faltan 1 foto» y estado Borrador", await li.count() === 1 && /Faltan 1 foto/.test(await li.innerText()) && /Borrador/i.test(await li.innerText()));
    await page.locator("select#pr-s").selectOption("ACTIVE"); await page.waitForTimeout(700);
    check("filtro «Publicados» lo oculta", await page.locator('ul[aria-label="Lista de productos"] > li').count() === 0);
    check("375px: lista de productos sin scroll horizontal", await (async () => { await page.setViewportSize({ width: 375, height: 800 }); const r = await noH(page); await page.setViewportSize({ width: 1280, height: 900 }); return r; })());
    await page.goto(W + "/admin/inventario"); await page.locator('input[type="search"]').fill(PNAME); await page.waitForTimeout(1200);
    await page.getByRole("link", { name: /Editar stock de/ }).first().waitFor();
    check("inventario: ADMIN ve «Editar» que lleva al producto", (await page.getByRole("link", { name: /Editar stock de/ }).first().getAttribute("href")).endsWith(productId));
  }

  console.log("══ 7. AJUSTES: PARÁMETROS (UI)");
  {
    await page.goto(W + "/admin/ajustes"); await page.locator('[name="exchange_rate_cop"]').waitFor();
    check("muestra los 9 parámetros con valores actuales", await page.locator('form input[inputmode="numeric"]').count() === 9 && (await page.locator('[name="exchange_rate_cop"]').inputValue()) === String(originalTRM));
    check("«Guardar cambios» deshabilitado sin cambios", await page.getByRole("button", { name: "Guardar cambios" }).isDisabled());
    await page.locator('[name="vat_percent"]').fill("150"); await page.getByRole("button", { name: "Guardar cambios" }).click(); await page.waitForTimeout(300);
    check("IVA 150 %: error en el campo y foco", await page.locator('[name="vat_percent"]').getAttribute("aria-invalid") === "true" && (await focusName(page)) === "vat_percent");
    await page.locator('[name="vat_percent"]').fill("19");
    await page.locator('[name="exchange_rate_cop"]').fill("4.300");
    check("aviso de cambios sin guardar", /1 cambio sin guardar/.test(await txt(page)));
    await page.getByRole("button", { name: "Guardar cambios" }).click(); await page.getByText(/Ajustes guardados/).waitFor();
    check("BD: TRM = 4300", sql(`select value from settings where key='exchange_rate_cop'`) === "4300");
    const est = (await api("POST", "/imports/quote", null, { items: [{ import_rate_id: originalRates[0].id, price_usd_cents: 10000, us_shipping_usd_cents: 0, quantity: 1 }] })).json.data;
    check("la calculadora pública ya usa la TRM nueva", est.exchange_rate_cop === 4300 && est.breakdown.product_cop === 430000, String(est.breakdown?.product_cop));
    check("375px: ajustes sin scroll horizontal", await (async () => { await page.setViewportSize({ width: 375, height: 800 }); const r = await noH(page); await page.setViewportSize({ width: 1280, height: 900 }); return r; })());
  }

  console.log("══ 8. AJUSTES: TARIFAS DE ENCARGOS (UI)");
  {
    const sneakers = originalRates.find((r) => /sneakers/i.test(r.name));
    await page.goto(W + "/admin/ajustes"); await page.getByRole("tab", { name: /Tarifas/ }).click();
    const item = page.locator('ul[aria-label="Tarifas por categoría"] li', { hasText: "sneakers" });
    await item.waitFor();
    check("categorías sin tarifa marcadas «Falta tarifa»", /Falta tarifa/i.test(await item.innerText()));
    await item.getByRole("button").click();
    await page.locator('dialog [name="freight_cop"]').waitFor();
    await page.locator('dialog [name="freight_cop"]').fill("30000"); await page.locator('dialog [name="handling_cop"]').fill("5000");
    await page.locator('dialog [name="insurance_cop"]').fill("2000"); await page.locator('dialog [name="national_delivery_cop"]').fill("8000"); await page.locator('dialog [name="margin_cop"]').fill("10000");
    check("el total de la tarifa se suma en vivo ($55.000)", (await page.locator("dialog").innerText()).replace(/\s/g, " ").includes("$ 55.000"));
    check("375px: el panel de tarifa sin scroll horizontal", await (async () => { await page.setViewportSize({ width: 375, height: 800 }); const r = await page.evaluate(() => { const d = document.querySelector("dialog"); return d.scrollWidth <= d.clientWidth && document.documentElement.scrollWidth <= window.innerWidth; }); await page.setViewportSize({ width: 1280, height: 900 }); return r; })());
    await page.locator('dialog [name="freight_cop"]').fill("abc"); await page.locator("dialog").getByRole("button", { name: "Guardar cambios" }).click();
    check("monto inválido: error y foco", await page.locator('dialog [name="freight_cop"]').getAttribute("aria-invalid") === "true");
    await page.locator('dialog [name="freight_cop"]').fill("30000");
    await page.locator("dialog").getByRole("button", { name: "Guardar cambios" }).click();
    await page.getByText(/Logística\s\$\s55\.000/).waitFor();
    check("BD: tarifa plana = suma de los 5 componentes", sql(`select flat_fee_cop from import_rates where id='${sneakers.id}'`) === "55000");
    const est = (await api("POST", "/imports/quote", null, { items: [{ import_rate_id: sneakers.id, price_usd_cents: 10000, us_shipping_usd_cents: 0, quantity: 1 }] })).json.data;
    check("la calculadora pública ya cobra la logística nueva", est.breakdown.logistics_cop === 55000, String(est.breakdown.logistics_cop));
    check("ya no aparece «Falta tarifa» en esa categoría", !/Falta tarifa/i.test(await page.locator('ul[aria-label="Tarifas por categoría"] li', { hasText: "sneakers" }).innerText()));
  }

  console.log("══ 9. ELIMINAR");
  {
    await page.goto(W + `/admin/productos/${productId}`); await page.getByRole("button", { name: "Eliminar este producto" }).waitFor();
    await page.getByRole("button", { name: "Eliminar este producto" }).click(); await page.getByRole("button", { name: /Sí, eliminar para siempre/ }).click();
    await page.getByText(/Archívalo en su lugar/).waitFor({ timeout: 10000 });
    check("con historial de stock NO se elimina: el mensaje dice «Archívalo» y el producto sigue", sql(`select count(*) from products where id='${productId}'`) === "1");
    await page.getByRole("button", { name: "Archivar" }).click(); await page.locator(".sb-badge", { hasText: "Archivado" }).first().waitFor();
    check("archivar lo deja ARCHIVED y fuera de la tienda", sql(`select status from products where id='${productId}'`) === "ARCHIVED" && (await api("GET", `/products/${slug}`)).status === 404);
    // un borrador sin tallas SÍ se elimina, con sus fotos
    const br = (await api("GET", "/admin/brands", ADMIN_TOK)).json.data.find((x) => x.name === BRAND), ct = (await api("GET", "/admin/categories", ADMIN_TOK)).json.data.find((x) => x.name === SUB);
    const tmp = (await api("POST", "/admin/products", ADMIN_TOK, { brand_id: br.id, category_id: ct.id, name: `Borrador Prueba ${stamp}`, base_price_cop: 100000 })).json.data;
    const up = (await upload(ADMIN_TOK, PNG(21))).json.data; await api("POST", `/admin/products/${tmp.id}/images`, ADMIN_TOK, { ...up, alt: "x" });
    check("(preparación) el borrador tiene su foto en disco", existsSync(`${UPLOADS}/${up.url.replace("/uploads/", "")}`));
    await page.goto(W + `/admin/productos/${tmp.id}`); await page.getByRole("button", { name: "Eliminar este producto" }).click(); await page.getByRole("button", { name: /Sí, eliminar para siempre/ }).click();
    await page.waitForURL(/\/admin\/productos$/, { timeout: 10000 });
    check("borrador sin stock: eliminado y su foto ya no está en disco", sql(`select count(*) from products where id='${tmp.id}'`) === "0" && !existsSync(`${UPLOADS}/${up.url.replace("/uploads/", "")}`));
    await page.goto(W + "/admin/catalogo"); await page.getByRole("tab", { name: "Categorías" }).click();
    const brRow = page.locator('ul[aria-label="Marcas"] li', { hasText: BRAND });
    await page.getByRole("tab", { name: "Marcas" }).click(); await brRow.waitFor();
    await brRow.getByRole("button", { name: /Eliminar la marca/ }).click(); await brRow.getByRole("button", { name: "Sí, eliminar" }).click();
    await page.getByText(/producto|en uso|asociad/i).first().waitFor({ timeout: 8000 });
    check("una marca con productos NO se puede eliminar (mensaje claro)", sql(`select count(*) from brands where name='${BRAND}'`) === "1");
  }
  await ctx.close();
  sql(`delete from users where id='${staff.id}'`);
} finally {
  await cleanup();
  await browser.close();
}
console.log(`\n${ok} OK, ${bad} fallos`);
