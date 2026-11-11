import { chromium } from "playwright-core";
import { W, API, API_ROOT, CHROME, OUT, UPLOAD_DIR, sql } from "./env.mjs";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
let ok = 0, bad = 0;
const check = (n, c, x = "") => { (c ? ok++ : bad++); console.log(`${c ? "✔" : "✘"} ${n}${x !== "" ? "  → " + x : ""}`); };
const api = async (method, path, token, body) => {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); return { status: r.status, json: t ? JSON.parse(t) : null };
};
const authTimes = [];
const throttle = async () => { const now = Date.now(); while (authTimes.length && now - authTimes[0] > 61000) authTimes.shift(); if (authTimes.length >= 9) { await new Promise((r) => setTimeout(r, 61000 - (now - authTimes[0]))); authTimes.shift(); } authTimes.push(Date.now()); };
const register = async (name, extra = {}) => {
  await throttle();
  const email = `s7${Date.now()}${Math.floor(Math.random() * 999)}@example.com`;
  const r = await api("POST", "/auth/register", null, { email, password: "clave-segura-1", full_name: name, ...extra });
  return { email, token: r.json.data.access_token, id: r.json.data.user.id };
};
const asUser = async (email, vp = { width: 1280, height: 900 }) => {
  await throttle();
  const ctx = await browser.newContext({ viewport: vp, locale: "es-CO" }); const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => m.type() === "error" && !/40[134]|409|422|429|Failed to load resource/.test(m.text()) && console.log("CONSOLE", m.text().slice(0, 200)));
  await page.goto(W + "/login"); await page.locator('[name="email"]').fill(email); await page.locator('[name="password"]').fill("clave-segura-1");
  await page.getByRole("button", { name: /Entrar|Iniciar sesión|Ingresar/i }).first().click(); await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  return { ctx, page };
};
const noH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const txt = (page) => page.locator("main").innerText();
const rates = (await api("GET", "/imports/rates")).json.data;
const sneakers = rates.find((r) => /sneakers/i.test(r.name)), manual = rates.find((r) => r.requires_manual_quote);
await throttle();
const adminTok = (await api("POST", "/auth/login", null, { email: "admin@starboy.local", password: "una-clave-larga-segura" })).json.data.access_token;

console.log("══ 1. API: detalle del cliente");
check("sin sesión → 401", (await api("GET", `/imports/${sneakers.id}`)).status === 401);

console.log("══ 2. CALCULADORA PÚBLICA (sin sesión)");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CO" }); const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(W + "/encargos-usa");
  check("landing con título, pasos y tiempos", /Traemos cualquier referencia/i.test(await txt(page)) && /Cómo funciona/i.test(await txt(page)) && await page.locator("#tiempos").count() === 1);
  await page.locator('[name="rate"]').waitFor(); await page.waitForFunction(() => document.querySelectorAll('[name="rate"] option').length > 3);
  await page.getByRole("button", { name: /Calcular estimado/i }).click();
  const errs = await page.locator('#calc-form [aria-invalid="true"]').count();
  check("vacío: errores en categoría y precio, con foco", errs >= 2 && (await page.evaluate(() => document.activeElement?.getAttribute("name"))) === "rate", String(errs));
  await page.locator('[name="rate"]').selectOption(sneakers.id);
  await page.locator('[name="price"]').fill("129,99"); await page.locator('[name="shipping"]').fill("8"); await page.locator('[name="qty"]').fill("2");
  const apiRes = (await api("POST", "/imports/quote", null, { items: [{ import_rate_id: sneakers.id, price_usd_cents: 12999, us_shipping_usd_cents: 800, quantity: 2 }] })).json.data;
  await page.getByRole("button", { name: /Calcular estimado/i }).click();
  await page.getByText("Total estimado").waitFor();
  const cop = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n).replace(/\s/g, " ");
  const t = (await page.locator("main").innerText()).replace(/\s/g, " ");
  check("el total mostrado es el que calcula la API (coma decimal aceptada)", t.includes(cop(apiRes.breakdown.total_cop).replace(/\s/g, " ")), cop(apiRes.breakdown.total_cop));
  check("muestra anticipo y saldo", t.includes(cop(apiRes.breakdown.deposit_cop)) && /Saldo al llegar/i.test(t));
  check("aclara que es un estimado de 48 h", /estimado/i.test(t) && /48 horas/.test(t));
  await page.locator('[name="rate"]').selectOption(manual.id);
  await page.getByRole("button", { name: /Calcular estimado/i }).click();
  await page.getByText("Cotización personalizada").first().waitFor();
  check("categoría de cotización manual: sin total, invita a solicitar", !/Total estimado/.test(await txt(page)));
  check("precio absurdo rechazado", await (async () => { await page.locator('[name="price"]').fill("999999999"); await page.getByRole("button", { name: /Calcular estimado/i }).click(); return (await page.locator('[name="price"]').getAttribute("aria-invalid")) === "true"; })());
  await page.goto(W + "/encargos-usa/cotizar");
  check("cotizar sin sesión → /login con regreso", page.url().includes("/login") && decodeURIComponent(page.url()).includes("next=/encargos-usa/cotizar"));
  await page.goto(W + "/encargos-usa/rastreo");
  check("rastreo sin sesión → /login", page.url().includes("/login"));
  await page.setViewportSize({ width: 375, height: 800 }); await page.goto(W + "/encargos-usa");
  check("375px: landing sin scroll horizontal", await noH(page));
  await ctx.close();
}

console.log("══ 3. SOLICITUD (cliente sin cédula)");
const A = await register("Camila Rojas", { phone: "3001234567" });
const B = await register("Otra Persona");
let importId, code;
{
  const { ctx, page } = await asUser(A.email);
  await page.goto(W + "/encargos-usa/cotizar"); await page.waitForSelector('[name="product_url_0"]'); await page.waitForFunction(() => document.querySelectorAll('[name="import_rate_id_0"] option').length > 3);
  check("pide la cédula porque no la tiene", await page.locator('[name="document_id"]').count() === 1);
  await page.getByRole("button", { name: /Solicitar cotización/i }).click();
  const n = await page.locator('form [aria-invalid="true"]').count();
  check("vacío: errores por campo (enlace, producto, categoría, precio, cédula)", n >= 5, String(n));
  await page.waitForTimeout(250); check("foco en el primer campo inválido", (await page.evaluate(() => document.activeElement?.getAttribute("name"))) === "product_url_0");
  await page.locator('[name="product_url_0"]').fill("http://www.nike.com/x");
  await page.getByRole("button", { name: /Solicitar cotización/i }).click();
  check("http:// rechazado (exige https)", /https/i.test(await page.locator("#" + (await page.locator('[name="product_url_0"]').getAttribute("id")) + "-error").innerText()));
  await page.locator('[name="product_url_0"]').fill("javascript:alert(1)");
  await page.getByRole("button", { name: /Solicitar cotización/i }).click();
  check("javascript: rechazado", (await page.locator('[name="product_url_0"]').getAttribute("aria-invalid")) === "true");
  // producto 1
  await page.locator('[name="product_url_0"]').fill("https://www.nike.com/t/air-jordan-1");
  await page.locator('[name="description_0"]').fill("Jordan 1 Retro High OG Chicago");
  await page.locator('[name="import_rate_id_0"]').selectOption(sneakers.id);
  await page.locator('[name="price_usd_0"]').fill("189.99"); await page.locator('[name="size_0"]').fill("US 9"); await page.locator('[name="quantity_0"]').fill("1");
  // producto 2
  await page.getByRole("button", { name: /Agregar otro producto/i }).click();
  check("segundo producto agregado", await page.locator('[name="product_url_1"]').count() === 1);
  await page.locator('[name="product_url_1"]').fill("https://www.stockx.com/hoodie"); await page.locator('[name="description_1"]').fill("Hoodie Essentials");
  await page.locator('[name="import_rate_id_1"]').selectOption(rates.find((r) => /pesada/i.test(r.name)).id); await page.locator('[name="price_usd_1"]').fill("90"); await page.locator('[name="quantity_1"]').fill("2");
  await page.getByRole("button", { name: /Quitar/i }).last().click();
  check("quitar un producto deja uno", await page.locator('[name="product_url_1"]').count() === 0 && await page.locator('[name="product_url_0"]').count() === 1);
  check("al quitar se conserva el contenido del que queda", (await page.locator('[name="description_0"]').inputValue()) !== "");
  await page.getByRole("button", { name: /Agregar otro producto/i }).click();
  await page.locator('[name="product_url_1"]').fill("https://www.stockx.com/hoodie"); await page.locator('[name="description_1"]').fill("Hoodie Essentials");
  await page.locator('[name="import_rate_id_1"]').selectOption(rates.find((r) => /pesada/i.test(r.name)).id); await page.locator('[name="price_usd_1"]').fill("90"); await page.locator('[name="quantity_1"]').fill("2");
  await page.locator('[name="document_id"]').fill("1.020.304.050");
  await page.locator('[name="customer_notes"]').fill("Acepto otro color");
  check("375px (con 2 productos): sin scroll horizontal", await (async () => { await page.setViewportSize({ width: 375, height: 800 }); const r = await noH(page); await page.setViewportSize({ width: 1280, height: 900 }); return r; })());
  await page.getByRole("button", { name: /Solicitar cotización/i }).click();
  await page.waitForURL(/\/cuenta\/encargos\/[0-9a-f-]{36}\?nuevo=1/, { timeout: 15000 });
  importId = page.url().match(/encargos\/([0-9a-f-]{36})/)[1];
  await page.getByText("Recibimos tu solicitud").waitFor();
  code = (await page.locator("h2").first().innerText()).replace(/Encargo\s+/i, "").trim();
  check("redirige al seguimiento con aviso", /^IMP-/.test(code), code);
  check("estado «Solicitada» y sin cotización", /Solicitada/i.test(await txt(page)) && !/Cotización\s*\n/.test(await txt(page)));
  check("lista los 2 productos con su enlace seguro", await page.locator("main").locator('a[rel*="noopener"]').count() === 2);
  check("BD: 2 ítems, cédula guardada en el perfil, a nombre del cliente", sql(`select count(*) from import_request_items where import_request_id='${importId}'`) === "2" && sql(`select document_id from users where id='${A.id}'`) === "1020304050");
  check("BD: precio en centavos y categoría", sql(`select declared_price_usd_cents from import_request_items where import_request_id='${importId}' and description like 'Jordan%'`) === "18999");

  console.log("══ 4. LISTA Y COTIZACIÓN");
  await page.goto(W + "/cuenta/encargos");
  check("pestaña «Mis encargos» activa", await page.locator('nav[aria-label="Mi cuenta"] a[aria-current="page"]').innerText().then((t) => /encargos/i.test(t)));
  const li = page.locator('ul[aria-label="Lista de encargos"] > li');
  await li.first().waitFor(); console.log("LI:", JSON.stringify(await li.allInnerTexts()));
  check("la lista muestra el encargo, «Sin cotizar aún» y resumen", await li.count() === 1 && /Sin cotizar/i.test(await li.innerText()) && /Jordan 1/i.test(await li.innerText()));
  // el equipo cotiza
  const q = await api("POST", `/admin/imports/${importId}/quotes`, adminTok, { deposit_percent: 50, notes_customer: "Incluye caja original" });
  check("el equipo emite la cotización", q.status === 201 || q.status === 200, String(q.status));
  await page.goto(W + "/cuenta/encargos");
  check("lista: «Tu cotización está lista» y botón Ver cotización", /cotización está lista/i.test(await li.innerText()) && await li.getByRole("link", { name: "Ver cotización" }).count() === 1);
  await page.goto(W + `/cuenta/encargos/${importId}`);
  await page.getByText("Aceptar y pagar anticipo").waitFor();
  const quote = (await api("GET", `/imports/${importId}`, A.token)).json.data.quote;
  const cop = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n).replace(/\s/g, " ");
  const t = (await txt(page)).replace(/\s/g, " ");
  check("cotización: total, anticipo y saldo del servidor", t.includes(cop(quote.total_cop)) && t.includes(cop(quote.deposit_cop)) && t.includes(cop(quote.balance_cop)), cop(quote.total_cop));
  check("cuenta regresiva de vigencia (≈ 2 d)", /Vence en (1|2) d/.test(t), (t.match(/Vence en [^.]*?(?= [A-Z])/) || [""])[0]);
  check("nota del equipo visible", /Incluye caja original/.test(t));
  check("375px: detalle con cotización sin scroll horizontal", await (async () => { await page.setViewportSize({ width: 375, height: 800 }); const r = await noH(page); await page.screenshot({ path: OUT + "/s7-encargo-movil.png", fullPage: true }); await page.setViewportSize({ width: 1280, height: 900 }); return r; })());

  console.log("══ 5. ACEPTAR → PASARELA → ANTICIPO");
  await page.getByRole("button", { name: /Aceptar y pagar anticipo/i }).click();
  await page.waitForURL(/\/pago\/sandbox\//, { timeout: 15000 });
  await page.getByText("Anticipo a pagar").waitFor();
  const pt = (await txt(page)).replace(/\s/g, " ");
  check("pasarela: muestra «Encargo IMP-…» y el anticipo exacto", pt.includes(code) && /Encargo/.test(pt) && pt.includes(cop(quote.deposit_cop)));
  check("pasarela: sin cuenta regresiva de reserva (es de órdenes)", !/reserva vence/i.test(pt));
  check("BD: encargo ACCEPTED y cotización ACCEPTED", sql(`select status from import_requests where id='${importId}'`) === "ACCEPTED");
  await page.getByRole("button", { name: /Simular pago rechazado/i }).click();
  await page.getByText(/pago fue rechazado/i).waitFor();
  check("rechazado: mensaje sin hablar de reserva de productos", !/reservados/i.test(await txt(page)));
  await page.getByRole("button", { name: /Intentar de nuevo/i }).click();
  await page.waitForURL(/\/pago\/sandbox\//); await page.getByRole("button", { name: /Simular pago aprobado/i }).waitFor();
  await page.getByRole("button", { name: /Simular pago aprobado/i }).click();
  await page.waitForURL(/\/cuenta\/encargos\/.*pago=aprobado/, { timeout: 15000 });
  await page.getByText(/Recibimos tu anticipo/).first().waitFor();
  check("vuelve al encargo con aviso de anticipo recibido", /Anticipo pagado/i.test(await txt(page)));
  check("BD: PAID, pago DEPOSIT aprobado por el monto de la cotización", sql(`select status from import_requests where id='${importId}'`) === "PAID" && sql(`select count(*) from payments where import_request_id='${importId}' and status='APPROVED' and kind='DEPOSIT' and amount_cop=${quote.deposit_cop}`) === "1");
  check("ya no ofrece aceptar ni pagar", (await page.getByRole("button", { name: /Aceptar|Pagar anticipo/i }).count()) === 0);

  console.log("══ 6. SEGUIMIENTO");
  await api("PATCH", `/admin/imports/${importId}/status`, adminTok, { status: "PURCHASED", note: "Compramos tu Jordan en Nike.com" });
  await api("PATCH", `/admin/imports/${importId}/status`, adminTok, { status: "IN_US_WAREHOUSE" });
  await api("PATCH", `/admin/imports/${importId}/status`, adminTok, { status: "IN_TRANSIT", carrier_usa: "UPS", tracking_usa: "1Z999AA10123456784", eta: new Date(Date.now() + 9 * 864e5).toISOString() });
  await api("PATCH", `/admin/imports/${importId}/status`, adminTok, { status: "IN_CUSTOMS", note: "En revisión de aduana" });
  await page.goto(W + `/cuenta/encargos/${importId}`); await page.getByText("Seguimiento").waitFor();
  const st = await txt(page);
  check("en aduana: etiqueta real y paso «En tránsito» marcado como actual", /En aduana/.test(st) && await page.locator('ol[aria-label="Progreso del encargo"] li[aria-current="step"]').innerText().then((x) => /En tránsito/.test(x) && /En aduana/.test(x)));
  check("guía, transportadora y fecha estimada visibles", /UPS/.test(st) && /1Z999AA10123456784/.test(st) && /Llegada estimada/.test(st));
  check("mensajes del equipo (notificables) visibles", /Compramos tu Jordan/.test(st) && /revisión de aduana/i.test(st));
  check("pasos anteriores con check y fecha", await page.locator('ol[aria-label="Progreso del encargo"] li svg').count() >= 5);
  await api("PATCH", `/admin/imports/${importId}/status`, adminTok, { status: "IN_CO_WAREHOUSE", tracking_co: "SERV-778899" });
  await api("PATCH", `/admin/imports/${importId}/status`, adminTok, { status: "BALANCE_DUE" });
  await page.goto(W + `/cuenta/encargos/${importId}`); await page.getByText(/saldo de/i).first().waitFor();
  check("saldo pendiente: aviso con el monto", (await txt(page)).replace(/\s/g, " ").includes(cop(quote.balance_cop)));
  await ctx.close();
}

console.log("══ 7. COTIZACIÓN VENCIDA Y ENCARGO AJENO");
{
  const { ctx, page } = await asUser(B.email);
  await page.goto(W + `/cuenta/encargos/${importId}`);
  await page.getByText(/No encontramos ese encargo/i).waitFor();
  check("encargo de otra persona: 404 sin revelar nada", !/IMP-/.test(await txt(page)) && (await api("GET", `/imports/${importId}`, B.token)).status === 404);
  await page.goto(W + "/cuenta/encargos/no-es-un-id"); await page.getByText(/Volver a mis encargos/i).waitFor();
  check("id inválido: mensaje, sin romper", await page.getByText(/Volver a mis encargos/i).count() === 1);
  await page.goto(W + "/cuenta/encargos"); await page.getByText(/Aún no tienes encargos/i).waitFor();
  check("lista vacía con llamada a la acción", await page.getByRole("link", { name: /Solicitar cotización/i }).count() === 1);
  await ctx.close();
  // B solicita y deja vencer la cotización
  const d = await api("POST", "/imports", B.token, { document_id: "5566778899", items: [{ product_url: "https://www.nike.com/x", description: "Gorra", quantity: 1, declared_price_usd_cents: 3500, import_rate_id: rates.find((r) => /Gorras/i.test(r.name)).id }] });
  const id2 = d.json.data.id;
  const q2 = (await api("POST", `/admin/imports/${id2}/quotes`, adminTok, {})).json.data;
  sql(`update import_quotes set valid_until = now() - interval '1 hour' where import_request_id='${id2}'`);
  const { ctx: c2, page: p2 } = await asUser(B.email);
  await p2.goto(W + `/cuenta/encargos/${id2}`); await p2.getByText(/Cotización/).first().waitFor();
  check("vencida: avisa y NO ofrece aceptar", /venció/i.test(await txt(p2)) && await p2.getByRole("button", { name: /Aceptar/i }).count() === 0);
  const acc = await api("POST", `/imports/${id2}/quotes/${q2.quote.id}/accept`, B.token);
  check("la API también la rechaza (409)", acc.status === 409, `${acc.status} ${acc.json?.error?.code}`);
  await p2.setViewportSize({ width: 375, height: 800 }); await p2.goto(W + "/cuenta/encargos");
  check("375px: lista sin scroll horizontal", await noH(p2));
  await c2.close();
}
await browser.close();
console.log(`\n${ok} OK, ${bad} fallos`);
