import { chromium } from "playwright-core";
import { W, API, API_ROOT, CHROME, OUT, UPLOAD_DIR, sql } from "./env.mjs";
import { execSync } from "node:child_process";
// El job que vence reservas corre al arrancar la API: esta prueba necesita poder reiniciarla.
// Ejemplo: RESTART_API_CMD='pkill -f starboy-server; cd apps/api && (setsid nohup ./starboy-server >/tmp/api.log 2>&1 &); sleep 3'
if (!process.env.RESTART_API_CMD) { console.error("checkout.mjs necesita RESTART_API_CMD (comando que reinicia la API). Ver e2e/README.md"); process.exit(2); }
const restartApi = () => { execSync(process.env.RESTART_API_CMD, { shell: "/bin/bash", stdio: "ignore" }); };
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
let ok = 0, bad = 0;
const check = (n, c, x = "") => { (c ? ok++ : bad++); console.log(`${c ? "✔" : "✘"} ${n}${x !== "" ? "  → " + x : ""}`); };
let seq = 0;
const newUser = async (vp = { width: 1280, height: 900 }, extra = {}) => {
  const ctx = await browser.newContext({ viewport: vp, locale: "es-CO" }); const page = await ctx.newPage();
  page.on("pageerror", e => console.log("PAGEERROR", e.message));
  page.on("console", m => m.type() === "error" && !/40[14]|429|Failed to load resource/.test(m.text()) && console.log("CONSOLE", m.text().slice(0, 220)));
  await page.goto(W + "/");
  const email = `co${Date.now()}${seq++}@example.com`;
  await page.evaluate(async (b) => { const r = await fetch("/api/v1/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); if (!r.ok) throw new Error("registro " + r.status); }, { email, password: "clave-segura-1", full_name: "Camila Andrea Rojas Pérez", phone: "3001234567", document_id: "1020304050", ...extra });
  await ctx.addCookies([{ name: "sb_session", value: "1", url: W }]);
  return { ctx, page, email };
};
const prod = async (slug) => (await (await fetch(`${API}/products/${slug}`)).json()).data;
const line = (p, size, qty) => { const v = p.variants.find(x => x.size === size); return { variantId: v.id, productSlug: p.slug, name: p.name, size, sku: v.sku, unitPriceCOP: v.price_cop, quantity: qty, imageUrl: p.images[0].url }; };
const seed = async (page, lines) => { await page.waitForTimeout(300); await page.evaluate(l => localStorage.setItem("sb-cart", JSON.stringify({ state: { lines: l }, version: 0 })), lines); };
const cartLines = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("sb-cart") || '{"state":{"lines":[]}}').state.lines);
const money = (s) => Number(s.replace(/\D/g, ""));
const [socks, cap, dunk, jordan4, hoodie] = await Promise.all(["demo-nike-everyday-socks", "demo-jordan-pro-cap", "demo-nike-dunk-low-panda", "demo-jordan-4-retro-white-oreo", "demo-essentials-hoodie-negro"].map(prod));
const fill = async (page, o = {}) => { const v = { first_name: "Camila Andrea", last_name: "Rojas Pérez", document_id: "1.020.304.050", phone: "+57 300 123 4567", city: "Medellín", line1: "Calle 10 # 20-30, El Poblado", line2: "Apto 502", notes: "Dejar en portería", ...o }; for (const [k, val] of Object.entries(v)) await page.locator(`[name="${k}"]`).fill(val); await page.locator('[name="department"]').selectOption(o.department ?? "Antioquia"); };
const submit = (page) => page.getByRole("button", { name: /Confirmar y pagar|Creando tu orden/ });
const orders = () => Number(sql("select count(*) from orders"));

console.log("══ 1. ACCESO Y ESTADO INICIAL");
let { ctx, page, email } = await newUser();
let anon = await browser.newContext(); const ap = await anon.newPage(); await ap.goto(W + "/checkout"); await ap.waitForURL(/\/login\?next=%2Fcheckout/);
check("sin sesión: /checkout pide iniciar sesión (y vuelve)", true); await anon.close();
await page.goto(W + "/checkout"); await page.getByRole("heading", { name: "Tu carrito está vacío" }).waitFor();
check("carrito vacío: estado vacío con CTA, sin formulario", !(await page.locator("#checkout-form").count()));

console.log("══ 2. FORMULARIO Y RESUMEN");
await seed(page, [line(dunk, "38", 1), line(socks, "Única", 2)]); await page.goto(W + "/checkout"); await page.locator("#checkout-form").waitFor();
const labels = await page.locator("#checkout-form label").allInnerTexts();
for (const l of ["Nombre", "Apellidos", "Cédula o documento", "Celular", "Departamento", "Ciudad o municipio", "Dirección exacta", "Notas de entrega"]) check(`campo «${l}»`, labels.some(x => x.toLowerCase().startsWith(l.toLowerCase())));
check("precargado desde la cuenta (nombre, apellidos, cédula, celular)", (await page.locator('[name="first_name"]').inputValue()) === "Camila Andrea" && (await page.locator('[name="last_name"]').inputValue()) === "Rojas Pérez" && (await page.locator('[name="document_id"]').inputValue()) === "1020304050" && (await page.locator('[name="phone"]').inputValue()) === "3001234567");
check("autocompletar del navegador (given-name, tel, address-level1…)", await page.locator('[name="first_name"]').getAttribute("autocomplete") === "given-name" && await page.locator('[name="phone"]').getAttribute("autocomplete") === "tel" && await page.locator('[name="department"]').getAttribute("autocomplete") === "address-level1");
check("33 departamentos + opción vacía", (await page.locator('[name="department"] option').count()) === 34);
const aside = page.locator("aside");
check("resumen: 2 ítems validados, subtotal 699.700", (await aside.locator("ul[aria-label='Productos del pedido'] > li").count()) === 2 && money(await aside.locator("dd").first().innerText()) === 579900 + 59900 * 2, (await aside.locator("dl").innerText()).replace(/\s+/g, " "));
check("botón «CONFIRMAR Y PAGAR» en el resumen", await submit(page).isVisible());
const fb = await page.locator("#checkout-form").boundingBox(), sb = await aside.boundingBox();
check("escritorio: formulario a la izquierda, resumen a la derecha", sb.x > fb.x + fb.width);

console.log("══ 3. VALIDACIÓN (cliente)");
let calls = []; page.on("request", r => r.url().includes("/api/v1/orders") && r.method() === "POST" && calls.push(r));
await page.locator('[name="first_name"]').fill(""); await page.locator('[name="last_name"]').fill(""); await page.locator('[name="document_id"]').fill(""); await page.locator('[name="phone"]').fill("12345");
await submit(page).click();
const errs = await page.locator("#checkout-form .sb-field-error").allInnerTexts();
check("errores por campo (nombre, apellidos, cédula, celular, departamento, ciudad, dirección)", errs.length === 7, errs.length + " errores");
await page.waitForTimeout(150);
check("foco en el primer campo inválido", await page.evaluate(() => document.activeElement?.getAttribute("name")) === "first_name");
check("celular inválido: mensaje claro", errs.some(e => e.includes("celular de 10 dígitos")));
check("no se llamó a la API", calls.length === 0);
await page.locator('[name="document_id"]').fill("12 3"); await submit(page).click(); check("cédula corta rechazada", (await page.locator("#checkout-form .sb-field-error").allInnerTexts()).some(e => e.includes("cédula o documento")));

console.log("══ 4. BORRADOR");
await fill(page, { first_name: "Camila", last_name: "Rojas", city: "Envigado" }); await page.reload(); await page.locator("#checkout-form").waitFor();
check("recargar conserva lo escrito (sessionStorage)", (await page.locator('[name="city"]').inputValue()) === "Envigado" && (await page.locator('[name="department"]').inputValue()) === "Antioquia");

console.log("══ 5. CAMINO FELIZ: orden → pasarela → pago → confirmación");
const stock0 = sql(`select stock_on_hand||'/'||stock_reserved from product_variants where sku='DEMO-NIKE-DUNK-LOW-PANDA-38'`);
await fill(page); let body, headers; page.on("request", r => { if (r.url().includes("/api/v1/orders") && r.method() === "POST") { body = r.postDataJSON(); headers = r.headers(); } });
const n0 = orders(); await submit(page).click();
await page.waitForURL(/\/pago\/sandbox\/SBX-[0-9a-f]+\?pid=/, { timeout: 15000 });
check("POST /orders: ítems con variant_id y cantidad, SIN precios ni totales", body.items.length === 2 && body.items.every(i => i.variant_id && i.quantity) && !JSON.stringify(body).match(/price|total|subtotal|unit/i), JSON.stringify(body.items.map(i => i.quantity)));
check("datos normalizados (cédula sin puntos, celular sin +57)", body.document_id === "1020304050" && body.shipping_address.phone === "3001234567" && body.shipping_address.recipient_name === "Camila Andrea Rojas Pérez");
check("dirección completa enviada", body.shipping_address.department === "Antioquia" && body.shipping_address.city === "Medellín" && body.shipping_address.line1.startsWith("Calle 10") && body.shipping_address.line2 === "Apto 502" && body.shipping_address.notes === "Dejar en portería");
check("lleva Idempotency-Key", /^[A-Za-z0-9_-]{8,64}$/.test(headers["idempotency-key"] ?? ""), headers["idempotency-key"]);
check("una orden creada y el carrito de Zustand vaciado", orders() === n0 + 1 && (await cartLines(page)).length === 0);
check("el borrador se descartó", await page.evaluate(() => sessionStorage.getItem("sb-checkout-draft") === null && sessionStorage.getItem("sb-checkout-attempt") === null));
const code = sql("select code from orders order by created_at desc limit 1"), total = Number(sql("select total_cop from orders order by created_at desc limit 1"));
check("stock reservado (no descontado) al crear la orden", sql(`select stock_on_hand||'/'||stock_reserved from product_variants where sku='DEMO-NIKE-DUNK-LOW-PANDA-38'`) === stock0.replace(/\/0$/, "/1"), sql(`select stock_on_hand||'/'||stock_reserved from product_variants where sku='DEMO-NIKE-DUNK-LOW-PANDA-38'`));
console.log("— Pasarela sandbox");
await page.getByRole("button", { name: "Simular pago aprobado" }).waitFor();
check("pasarela: marcada «Modo prueba», con código y total del servidor", await page.getByText("Modo prueba").isVisible() && (await page.locator("main").innerText()).includes(code) && money(await page.locator("dd").last().innerText()) === total, `${code} · ${total}`);
check("el monto sale del servidor (699.700)", total === 699700);
await page.getByRole("button", { name: "Simular pago aprobado" }).click();
await page.waitForURL(/\/checkout\/confirmacion\/[0-9a-f-]{36}\?pago=aprobado/);
await page.getByRole("heading", { name: "¡Gracias por tu compra!" }).waitFor();
const txt = await page.locator("main").innerText();
check("confirmación: código oficial SB-…", txt.includes(code) && /SB-\d{6}/.test(code), code);
check("confirmación: estado «Pagada»", txt.includes("Pagada"));
check("confirmación: ítems, talla, cantidad y totales", txt.includes("Nike Dunk Low") && txt.includes("Talla 38") && txt.includes("Nike Everyday x3") && /2 × \$\s59\.900/.test(txt) && /\$\s699\.700/.test(txt), "");
check("confirmación: dirección de envío", txt.includes("Camila Andrea Rojas Pérez") && txt.includes("Calle 10 # 20-30, El Poblado") && txt.includes("Apto 502") && txt.includes("Medellín, Antioquia") && txt.includes("Dejar en portería"));
check("confirmación: seguimiento con «Pagada» y «Pendiente de pago»", /seguimiento/i.test(txt) && txt.includes("Pendiente de pago") && txt.includes("Pagada"));
check("envío en $0 mostrado como «Gratis»", txt.includes("Gratis"));
check("BD: orden PAID, pago APPROVED, stock descontado y sin reservas", sql("select status from orders order by created_at desc limit 1") === "PAID" && sql("select status from payments order by created_at desc limit 1") === "APPROVED" && sql(`select stock_on_hand||'/'||stock_reserved from product_variants where sku='DEMO-NIKE-DUNK-LOW-PANDA-38'`) === "5/0");
check("BD: bitácora RESERVE + COMMIT con el comprador como autor de la reserva", sql(`select string_agg(type, ',' order by created_at) from inventory_movements where order_id=(select id from orders order by created_at desc limit 1) and variant_id=(select id from product_variants where sku='DEMO-NIKE-DUNK-LOW-PANDA-38')`) === "RESERVE,COMMIT");
await page.getByRole("link", { name: "Seguir comprando" }).click(); await page.waitForURL(W + "/productos");

console.log("══ 6. DOBLE CLIC Y RED CAÍDA (llave de idempotencia)");
({ ctx, page } = await newUser()); await seed(page, [line(cap, "Única", 1)]); await page.goto(W + "/checkout"); await page.locator("#checkout-form").waitFor(); await fill(page);
const n1 = orders(); await submit(page).dblclick(); await page.waitForURL(/\/pago\/sandbox\//, { timeout: 15000 });
check("doble clic: una sola orden", orders() === n1 + 1);
await ctx.close();
// red caída DESPUÉS de que el servidor creó la orden
({ ctx, page } = await newUser()); await seed(page, [line(socks, "Única", 1)]); await page.goto(W + "/checkout"); await page.locator("#checkout-form").waitFor(); await fill(page);
let first = true; const keys = [];
await page.route("**/api/v1/orders", async (route) => { if (route.request().method() !== "POST") return route.continue(); keys.push(route.request().headers()["idempotency-key"]); if (first) { first = false; await route.fetch(); return route.abort("connectionreset"); } return route.continue(); });
const n2 = orders(); await submit(page).click();
await page.getByRole("alert").filter({ hasText: "No pudimos confirmar tu orden" }).waitFor({ timeout: 15000 });
check("la orden SÍ se creó en el servidor, pero el cliente no lo supo", orders() === n2 + 1);
check("el carrito NO se vació y el botón vuelve a estar disponible", (await cartLines(page)).length === 1 && await submit(page).isEnabled());
check("mensaje: «no se cobrará dos veces»", (await page.locator("#checkout-form [role=alert]").innerText()).includes("no se cobrará dos veces"));
await submit(page).click(); await page.waitForURL(/\/pago\/sandbox\//, { timeout: 15000 });
check("el reintento usó la MISMA llave", keys.length === 2 && keys[0] === keys[1], keys.join(" / "));
check("…y no duplicó la orden (sigue 1) ni la reserva", orders() === n2 + 1 && sql("select count(*) from inventory_movements where type='RESERVE' and order_id=(select id from orders order by created_at desc limit 1)") === "1");
check("ahora sí se vació el carrito", (await cartLines(page)).length === 0);
await ctx.close();

console.log("══ 7. ERRORES DE LA API");
restartApi();
// 7a. sin stock suficiente (el cliente cree que hay, el servidor no)
({ ctx, page } = await newUser()); await seed(page, [line(jordan4, "43", 3), line(socks, "Única", 1)]);
await page.route("**/api/v1/products/*", async (route) => { const r = await route.fetch(); const j = await r.json(); j.data.variants.forEach(v => v.available = 99); route.fulfill({ response: r, json: j }); });
await page.goto(W + "/checkout"); await page.locator("#checkout-form").waitFor(); await fill(page);
const n3 = orders(); await submit(page).click();
const al = page.locator("#checkout-form [role=alert]").first(); await al.waitFor();
check("409 INSUFFICIENT_STOCK: mensaje y detalle por producto", (await al.innerText()).includes("No tenemos stock suficiente") && (await page.locator("#checkout-form").innerText()).includes("Jordan 4 Retro (talla 43): solo quedan 1"));
check("no se creó orden y el carrito se conserva", orders() === n3 && (await cartLines(page)).length === 2);
await page.getByRole("button", { name: "Ajustar mi carrito" }).click();
check("«Ajustar mi carrito» deja la cantidad en lo disponible", (await cartLines(page)).find(l => l.size === "43").quantity === 1);
await submit(page).click(); await page.waitForURL(/\/pago\/sandbox\//, { timeout: 15000 });
check("tras ajustar, la compra sale", orders() === n3 + 1);
await page.getByRole("button", { name: "Simular pago aprobado" }).click(); await page.waitForURL(/confirmacion/);
await ctx.close();
// 7b. producto retirado
({ ctx, page } = await newUser()); await seed(page, [line(hoodie, "M", 1), line(socks, "Única", 1)]);
await page.route("**/api/v1/products/*", async (route) => { const r = await route.fetch(); if (r.status() !== 200) return route.fulfill({ response: r }); const j = await r.json(); j.data.variants.forEach(v => v.available = 99); route.fulfill({ response: r, json: j }); });
await page.goto(W + "/checkout"); await page.locator("#checkout-form").waitFor(); await fill(page);
sql("update products set status='ARCHIVED' where slug='demo-essentials-hoodie-negro'");
const n4 = orders(); await submit(page).click(); await page.locator("#checkout-form [role=alert]").first().waitFor();
sql("update products set status='ACTIVE' where slug='demo-essentials-hoodie-negro'");
check("422 VARIANT_UNAVAILABLE: avisa cuál producto", (await page.locator("#checkout-form").innerText()).includes("Essentials Hoodie (talla M)") && orders() === n4);
await page.getByRole("button", { name: "Quitar del carrito" }).click(); check("«Quitar del carrito» lo elimina", (await cartLines(page)).length === 1 && (await cartLines(page))[0].name === "Nike Everyday x3");
await ctx.close();
// 7c. errores por campo de la API / límite de intentos / 500
({ ctx, page } = await newUser()); await seed(page, [line(socks, "Única", 1)]); await page.goto(W + "/checkout"); await page.locator("#checkout-form").waitFor(); await fill(page);
await page.route("**/api/v1/orders", (route) => route.request().method() === "POST" ? route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Revisa los datos que enviaste.", details: { "shipping_address.phone": "Teléfono inválido (API).", "shipping_address.recipient_name": "Nombre inválido (API).", "document_id": "Documento inválido (API)." } } }) }) : route.continue());
await submit(page).click(); await page.getByText("Teléfono inválido (API).").waitFor(); await page.waitForTimeout(150);
check("422 por campo: se pinta bajo celular, nombre y documento", await page.locator('[name="phone"]').getAttribute("aria-invalid") === "true" && await page.getByText("Nombre inválido (API).").isVisible() && await page.getByText("Documento inválido (API).").isVisible());
check("foco en el primer campo con error del servidor", await page.evaluate(() => document.activeElement?.getAttribute("name")) === "first_name");
await page.unroute("**/api/v1/orders");
await page.route("**/api/v1/orders", (route) => route.request().method() === "POST" ? route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { code: "TOO_MANY_REQUESTS", message: "Demasiados intentos. Espera un momento e inténtalo de nuevo." } }) }) : route.continue());
await submit(page).click(); await page.getByText("Demasiados intentos").waitFor(); check("429: mensaje y se puede reintentar", await submit(page).isEnabled() && (await cartLines(page)).length === 1);
await page.unroute("**/api/v1/orders");
await page.route("**/api/v1/orders", (route) => route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Error interno." } }) }) : route.continue());
await submit(page).click(); await page.getByText("No pudimos confirmar tu orden").waitFor(); check("500: mensaje seguro, datos y carrito intactos", (await cartLines(page)).length === 1 && (await page.locator('[name="city"]').inputValue()) === "Medellín");
await ctx.close();

console.log("══ 8. PAGO RECHAZADO, REINTENTO, RESERVA VENCIDA");
({ ctx, page } = await newUser()); await seed(page, [line(socks, "Única", 1)]); await page.goto(W + "/checkout"); await page.locator("#checkout-form").waitFor(); await fill(page); await submit(page).click(); await page.waitForURL(/\/pago\/sandbox\//, { timeout: 15000 });
const oid = sql("select id from orders order by created_at desc limit 1");
await page.getByRole("button", { name: "Simular pago rechazado" }).click(); await page.getByText("Tu pago fue rechazado").waitFor();
check("rechazado: mensaje claro; reserva intacta", sql(`select status from orders where id='${oid}'`) === "PENDING_PAYMENT" && sql(`select status from payments where order_id='${oid}' order by created_at limit 1`) === "DECLINED");
await page.getByRole("button", { name: "Intentar de nuevo" }).click(); await page.waitForURL(/\/pago\/sandbox\/SBX-/); await page.getByRole("button", { name: "Simular pago aprobado" }).waitFor();
check("reintentar abre un nuevo cobro", sql(`select count(*) from payments where order_id='${oid}'`) === "2");
await page.getByRole("link", { name: "Pagar después" }).click(); await page.waitForURL(/confirmacion.*pago=pendiente/);
await page.getByRole("heading", { name: "Tu orden está reservada" }).waitFor();
let c = await page.locator("main").innerText(); check("pendiente: «Falta tu pago», total, cuenta regresiva ~30 min y botón «Pagar ahora»", /falta tu pago/i.test(c) && /Tu reserva vence en (29|30):\d\d/.test(c) && await page.getByRole("button", { name: "Pagar ahora" }).isVisible(), (c.match(/vence en [\d:]+/) || [])[0]);
console.log("— El pago llega desde otra pestaña (polling)");
const tab2 = await ctx.newPage(); await page.getByRole("button", { name: "Pagar ahora" }).click(); await page.waitForURL(/\/pago\/sandbox\//); const url2 = page.url(); await page.goBack(); await page.waitForURL(/confirmacion/);
await tab2.goto(url2); await tab2.getByRole("button", { name: "Simular pago aprobado" }).click(); await tab2.waitForURL(/confirmacion/);
await page.getByRole("heading", { name: "¡Gracias por tu compra!" }).waitFor({ timeout: 12000 });
check("la pestaña pendiente se actualiza sola a «Pagada»", true); await tab2.close();
await ctx.close();
// reserva vencida
({ ctx, page } = await newUser()); await seed(page, [line(socks, "Única", 1)]); await page.goto(W + "/checkout"); await page.locator("#checkout-form").waitFor(); await fill(page); await submit(page).click(); await page.waitForURL(/\/pago\/sandbox\//, { timeout: 15000 });
const oid2 = sql("select id from orders order by created_at desc limit 1"); const stockS = sql("select stock_on_hand||'/'||stock_reserved from product_variants where sku='DEMO-NIKE-EVERYDAY-SOCKS-Única'");
sql(`update orders set reserved_until = now() - interval '1 minute' where id='${oid2}'`); restartApi();   // el job de vencimiento corre al arrancar
const resBefore = Number(stockS.split("/")[1]);
check("job: orden cancelada y SU reserva liberada (las de otras órdenes siguen)", sql(`select status from orders where id='${oid2}'`) === "CANCELLED" && Number(sql("select stock_reserved from product_variants where sku='DEMO-NIKE-EVERYDAY-SOCKS-Única'")) === resBefore - 1, `reservado ${resBefore} → ${sql("select stock_reserved from product_variants where sku='DEMO-NIKE-EVERYDAY-SOCKS-Única'")}`);
await page.getByRole("button", { name: "Simular pago aprobado" }).click();
await page.getByText("lo estamos revisando").waitFor({ timeout: 8000 });
check("pago tardío sobre orden vencida: «en revisión», sin dar la compra por hecha", sql(`select status from payments where order_id='${oid2}'`) === "IN_REVIEW" && sql(`select status from orders where id='${oid2}'`) === "CANCELLED");
await page.goto(W + `/checkout/confirmacion/${oid2}`); await page.getByRole("heading", { name: "Tu orden fue cancelada" }).waitFor();
c = await page.locator("main").innerText(); check("confirmación de orden cancelada: motivo (no se recibió el pago a tiempo) y sin botón de pago", c.includes("no recibimos el pago a tiempo") && !(await page.getByRole("button", { name: "Pagar ahora" }).count()));
await ctx.close();

console.log("══ 9. SEGURIDAD Y RUTAS");
({ ctx, page } = await newUser()); await page.goto(W + `/checkout/confirmacion/${oid2}`);
await page.getByRole("heading", { name: "No encontramos esa orden" }).waitFor(); check("la orden de otra persona no se ve (404, sin revelar que existe)", true);
check("id inválido → 404", (await ctx.request.get(W + "/checkout/confirmacion/hola", { headers: { Cookie: "sb_session=1" } })).status() === 404);
await page.goto(W + "/pago/sandbox/SBX-xyz"); await page.getByText("enlace de pago está incompleto").waitFor(); check("pasarela sin pid: mensaje claro", true);
const pid = sql(`select id from payments where order_id='${oid2}' limit 1`);
await page.goto(W + `/pago/sandbox/SBX-otra-ref?pid=${pid}`); await page.getByText("No encontramos este pago").waitFor(); check("pid ajeno / ref que no coincide → no encontrado", true);
await ctx.close();

console.log("\n══ 10. MÓVIL 375");
restartApi();
({ ctx, page } = await newUser({ width: 375, height: 780 })); await seed(page, [line(dunk, "38", 1), line(socks, "Única", 2)]); await page.goto(W + "/checkout"); await page.locator("#checkout-form").waitFor();
check("checkout: sin scroll horizontal", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
const cols = await page.locator('[name="first_name"], [name="last_name"]').evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().left)));
check("una sola columna de campos", new Set(cols).size === 1, cols.join(","));
const a = await page.locator("aside").boundingBox(), f = await page.locator("#checkout-form").boundingBox(); check("el resumen queda debajo del formulario", a.y > f.y + f.height - 5);
const small = await page.locator("main input:visible, main select:visible, main textarea:visible, main button:visible, main a.sb-btn:visible").evaluateAll(es => es.filter(e => e.getBoundingClientRect().height < 44).map(e => e.name || e.textContent.trim()));
check("campos y botones ≥ 44px", small.length === 0, small.join(","));
const fs = await page.locator("input").first().evaluate(e => parseFloat(getComputedStyle(e).fontSize)); check("inputs a 16px (iOS no hace zoom)", fs >= 16, fs + "px");
await page.screenshot({ path: OUT + "/co-form-movil.png", fullPage: true });
await fill(page); await submit(page).click(); await page.waitForURL(/\/pago\/sandbox\//, { timeout: 15000 });
check("pasarela: sin scroll horizontal", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))); await page.screenshot({ path: OUT + "/co-pasarela-movil.png" });
await page.getByRole("button", { name: "Simular pago aprobado" }).click(); await page.getByRole("heading", { name: "¡Gracias por tu compra!" }).waitFor();
check("confirmación: sin scroll horizontal", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))); await page.screenshot({ path: OUT + "/co-confirmacion-movil.png", fullPage: true });
for (const wd of [320, 375, 768, 1024, 1280]) { await page.setViewportSize({ width: wd, height: 800 }); await page.waitForTimeout(150); check(`confirmación a ${wd}px sin desborde`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))); }
await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(200); await page.screenshot({ path: OUT + "/co-confirmacion.png", fullPage: true });
await ctx.close();
({ ctx, page } = await newUser()); await seed(page, [line(dunk, "38", 1), line(socks, "Única", 2)]); await page.goto(W + "/checkout"); await page.locator("#checkout-form").waitFor(); await page.screenshot({ path: OUT + "/co-form.png", fullPage: true });
console.log(`\n${ok} OK, ${bad} fallos`); await browser.close();
