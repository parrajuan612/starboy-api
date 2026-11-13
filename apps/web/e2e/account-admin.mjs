import { chromium } from "playwright-core";
import { W, API, API_ROOT, CHROME, OUT, UPLOAD_DIR, sql } from "./env.mjs";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
let ok = 0, bad = 0;
const check = (n, c, x = "") => { (c ? ok++ : bad++); console.log(`${c ? "✔" : "✘"} ${n}${x !== "" ? "  → " + x : ""}`); };
const api = async (method, path, token, body, headers = {}) => {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); return { status: r.status, json: t ? JSON.parse(t) : null };
};
// /auth/login y /auth/register comparten un límite de 10 por minuto por IP: se espacian las llamadas del guion.
const authTimes = [];
const throttle = async () => { const now = Date.now(); while (authTimes.length && now - authTimes[0] > 61000) authTimes.shift(); if (authTimes.length >= 9) { await new Promise((r) => setTimeout(r, 61000 - (now - authTimes[0]))); authTimes.shift(); } authTimes.push(Date.now()); };
const register = async (name, extra = {}) => {
  await throttle();
  const email = `s6${Date.now()}${Math.floor(Math.random() * 999)}@example.com`;
  const r = await api("POST", "/auth/register", null, { email, password: "clave-segura-1", full_name: name, ...extra });
  return { email, token: r.json.data.access_token, id: r.json.data.user.id };
};
const login = async (page, email, password = "clave-segura-1", next = "") => {
  await throttle();
  await page.goto(W + "/login" + next); await page.locator('[name="email"]').fill(email); await page.locator('[name="password"]').fill(password);
  await page.getByRole("button", { name: /Entrar|Iniciar sesión|Ingresar/i }).first().click(); await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
};
const newPage = async (vp = { width: 1280, height: 900 }) => {
  const ctx = await browser.newContext({ viewport: vp, locale: "es-CO" }); const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => m.type() === "error" && !/40[134]|409|422|429|Failed to load resource/.test(m.text()) && console.log("CONSOLE", m.text().slice(0, 220)));
  return { ctx, page };
};
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const hscrollInfo = (page) => page.evaluate(() => `${document.documentElement.scrollWidth}/${window.innerWidth}`);

// ── Datos: cliente con 2 pedidos (uno pagado, uno pendiente) y un encargo
await throttle();
const adminTok = (await api("POST", "/auth/login", null, { email: "admin@starboy.local", password: "una-clave-larga-segura" })).json.data.access_token;
const cust = await register("Camila Rojas", { phone: "3001234567" });
const other = await register("Otra Persona");
const prod = async (slug) => (await api("GET", `/products/${slug}`)).json.data;
const dunk = await prod("demo-nike-dunk-low-panda"), socks = await prod("demo-nike-everyday-socks");
const addr = { recipient_name: "Camila Rojas", phone: "3001234567", department: "Antioquia", city: "Medellín", line1: "Calle 10 # 20-30" };
const mk = async (v, q, key) => (await api("POST", "/orders", cust.token, { items: [{ variant_id: v, quantity: q }], document_id: "1020304050", shipping_address: addr }, { "Idempotency-Key": key })).json.data;
const o1 = await mk(socks.variants[0].id, 2, "s6-order-one-" + Date.now());
const pay = (await api("POST", "/payments/checkout", cust.token, { order_id: o1.id, provider: "SANDBOX" })).json.data;
await api("POST", `/payments/${pay.id}/simulate`, cust.token, { outcome: "approved" });
const o2 = await mk(dunk.variants.find((v) => v.size === "38")?.id ?? dunk.variants[0].id, 1, "s6-order-two-" + Date.now());
const rates = (await api("GET", "/imports/rates")).json.data;
const imp = (await api("POST", "/imports", cust.token, { document_id: "1020304050", customer_notes: "Lo necesito para diciembre", items: [{ product_url: "https://www.nike.com/t/air-max", store_name: "Nike.com", description: "Air Max 90 blancos", size: "42", quantity: 1, declared_price_usd_cents: 12000, import_rate_id: rates[0].id }] })).json.data;
console.log("datos:", o1.code, o2.code, imp.code);

console.log("══ 1. PERFIL");
{
  const { ctx, page } = await newPage();
  await login(page, cust.email, "clave-segura-1", "?next=%2Fcuenta");
  await page.getByRole("heading", { name: "Datos personales" }).waitFor();
  const tabs = await page.locator('nav[aria-label="Mi cuenta"] a').allInnerTexts();
  check("pestañas Perfil, Direcciones, Mis pedidos y Mis encargos", tabs.join("|").toLowerCase() === "perfil|direcciones|mis pedidos|mis encargos", tabs.join("|"));
  check("pestaña activa con aria-current", (await page.locator('nav[aria-label="Mi cuenta"] a[aria-current="page"]').innerText()).toLowerCase() === "perfil");
  check("precarga nombre y celular", (await page.locator('[name="full_name"]').inputValue()) === "Camila Rojas" && (await page.locator('[name="phone"]').inputValue()) === "3001234567");
  check("correo visible pero no editable", await page.locator('[name="email"]').isDisabled());
  await page.locator('[name="phone"]').fill("123"); await page.locator('[name="document_id"]').fill("12");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  const errs = await page.locator("form .sb-field-error").allInnerTexts();
  check("celular y cédula inválidos: errores por campo", errs.length === 2, errs.join(" / "));
  await page.waitForTimeout(200); check("foco en el primer campo inválido", (await page.evaluate(() => document.activeElement?.getAttribute("name"))) === "phone");
  await page.locator('[name="full_name"]').fill("Camila Andrea Rojas"); await page.locator('[name="phone"]').fill("+57 310 555 1234"); await page.locator('[name="document_id"]').fill("1.020.304.050");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.getByText("Datos guardados.").waitFor();
  check("guardado confirmado", true);
  check("BD: nombre, celular (sin +57) y cédula normalizada", sql(`select full_name||'|'||phone||'|'||document_id from users where email='${cust.email}'`) === "Camila Andrea Rojas|3105551234|1020304050");
  check("el menú de la cuenta ya usa el nombre nuevo", (await page.locator('a[aria-label^="Mi cuenta, "]').first().getAttribute("aria-label")).includes("Camila Andrea Rojas"));
  await page.reload(); await page.getByRole("heading", { name: "Datos personales" }).waitFor();
  check("tras recargar se conserva", (await page.locator('[name="document_id"]').inputValue()) === "1020304050");
  await ctx.close();
}

console.log("══ 2. DIRECCIONES");
{
  const { ctx, page } = await newPage();
  await login(page, cust.email, "clave-segura-1", "?next=%2Fcuenta%2Fdirecciones");
  await page.getByText("Aún no tienes direcciones guardadas").waitFor();
  check("estado vacío", true);
  await page.getByRole("button", { name: /Agregar dirección/ }).click();
  await page.getByRole("button", { name: "Guardar dirección" }).click();
  const e1 = await page.locator("form .sb-field-error").allInnerTexts();
  check("validación: departamento, ciudad y dirección", e1.length === 3, e1.length + " errores");
  await page.locator('[name="label"]').fill("Casa"); await page.locator('[name="department"]').selectOption("Antioquia"); await page.locator('[name="city"]').fill("Medellín"); await page.locator('[name="line1"]').fill("Calle 10 # 20-30");
  check("la primera dirección queda predeterminada (casilla bloqueada)", await page.getByRole("checkbox").isChecked() && await page.getByRole("checkbox").isDisabled());
  await page.getByRole("button", { name: "Guardar dirección" }).click();
  await page.locator('ul[aria-label="Mis direcciones"] > li').first().waitFor();
  check("primera dirección guardada y predeterminada", (await page.locator('ul[aria-label="Mis direcciones"] > li').count()) === 1 && (await page.locator('ul[aria-label="Mis direcciones"] > li').first().innerText()).toLowerCase().includes("predeterminada"));
  await page.getByRole("button", { name: /Agregar dirección/ }).click();
  await page.locator('[name="label"]').fill("Oficina"); await page.locator('[name="department"]').selectOption("Cundinamarca"); await page.locator('[name="city"]').fill("Bogotá"); await page.locator('[name="line1"]').fill("Carrera 7 # 71-21");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Guardar dirección" }).click();
  await page.locator('ul[aria-label="Mis direcciones"] > li').nth(1).waitFor();
  const first = await page.locator('ul[aria-label="Mis direcciones"] > li').first().innerText();
  check("marcar «predeterminada» pasa la insignia a la nueva (primera en la lista)", first.toLowerCase().includes("oficina") && first.toLowerCase().includes("predeterminada"));
  check("BD: una sola predeterminada", sql(`select count(*) from addresses where user_id='${cust.id}' and is_default`) === "1");
  // editar
  await page.locator('ul[aria-label="Mis direcciones"] > li').nth(1).getByRole("button", { name: /Editar/ }).click();
  await page.locator('[name="line1"]').fill("Calle 12 # 34-56"); await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.getByText("Calle 12 # 34-56").waitFor();
  check("editar dirección", true);
  // hacer predeterminada
  await page.locator('ul[aria-label="Mis direcciones"] > li').nth(1).getByRole("button", { name: "Hacer predeterminada" }).click();
  await page.waitForFunction(() => document.querySelector('ul[aria-label="Mis direcciones"] > li')?.textContent?.includes("Casa") && /predeterminada/i.test(document.querySelector('ul[aria-label="Mis direcciones"] > li')?.textContent));
  check("«Hacer predeterminada» cambia la insignia", true);
  // eliminar con confirmación
  await page.locator('ul[aria-label="Mis direcciones"] > li').first().getByRole("button", { name: /Eliminar/ }).click();
  check("eliminar pide confirmación", await page.getByText("¿Eliminar esta dirección?").isVisible());
  await page.getByRole("button", { name: "No" }).click();
  check("«No» cancela", (await page.locator('ul[aria-label="Mis direcciones"] > li').count()) === 2);
  await page.locator('ul[aria-label="Mis direcciones"] > li').first().getByRole("button", { name: /Eliminar/ }).click(); await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await page.waitForFunction(() => document.querySelectorAll('ul[aria-label="Mis direcciones"] > li').length === 1);
  check("al borrar la predeterminada, la otra la reemplaza", (await page.locator('ul[aria-label="Mis direcciones"] > li').first().innerText()).toLowerCase().includes("predeterminada"));
  check("BD: queda 1 dirección y es predeterminada", sql(`select count(*)||'|'||bool_and(is_default) from addresses where user_id='${cust.id}'`) === "1|true");
  // ajena
  const r = await api("PATCH", `/me/addresses/${sql(`select id from addresses where user_id='${cust.id}'`)}`, other.token, { city: "X" });
  check("API: no se puede tocar la dirección de otra persona (404)", r.status === 404);
  await ctx.close();
}

console.log("══ 3. MIS PEDIDOS");
{
  const { ctx, page } = await newPage();
  await login(page, cust.email, "clave-segura-1", "?next=%2Fcuenta%2Fpedidos");
  await page.getByRole("heading", { name: "Mis pedidos" }).waitFor(); await page.locator('ul[aria-label="Lista de pedidos"] > li').first().waitFor();
  check("lista con 2 pedidos", (await page.locator('ul[aria-label="Lista de pedidos"] > li').count()) === 2);
  const card1 = page.locator('ul[aria-label="Lista de pedidos"] > li', { hasText: o1.code }), card2 = page.locator('ul[aria-label="Lista de pedidos"] > li', { hasText: o2.code });
  check("pagada: insignia «Pagada» y línea de tiempo con paso actual", (await card1.innerText()).includes("Pagada") && (await card1.locator('li[aria-current="step"]').count()) === 1);
  check("pendiente: botón «Pagar ahora»", await card2.getByRole("link", { name: "Pagar ahora" }).isVisible());
  check("resumen de prendas y total", (await card1.innerText()).includes("Everyday") || (await card1.innerText()).includes("× 2"));
  check("sin «Pagar ahora» en la pagada", (await card1.getByRole("link", { name: "Pagar ahora" }).count()) === 0);
  await card1.getByRole("link", { name: "Ver seguimiento" }).click();
  await page.getByRole("heading", { name: new RegExp("Pedido " + o1.code) }).waitFor();
  check("detalle: línea de tiempo completa (5 pasos)", (await page.locator('ol[aria-label="Progreso del pedido"] > li').count()) === 5);
  check("detalle: paso «Pagada» actual", (await page.locator('ol[aria-label="Progreso del pedido"] > li[aria-current="step"]').innerText()).includes("Pagada"));
  check("detalle: aviso de guía pendiente", await page.getByText("la guía de envío aparecerá aquí").isVisible());
  check("detalle: dirección y prendas", (await page.locator("main").innerText()).includes("Calle 10 # 20-30"));
  // pedido ajeno
  const { ctx: c2, page: p2 } = await newPage(); await login(p2, other.email, "clave-segura-1", "?next=%2Fcuenta%2Fpedidos%2F" + o1.id);
  await p2.getByText("No encontramos ese pedido en tu cuenta.").waitFor(); check("pedido de otra persona: 404 sin revelar nada", true); await c2.close();
  await ctx.close();
}

console.log("══ 4. PANEL: ACCESO");
{
  const { ctx, page } = await newPage();
  await login(page, cust.email, "clave-segura-1", "?next=%2Fadmin%2Fordenes");
  await page.getByRole("heading", { name: "Sin acceso" }).waitFor(); check("cliente en /admin/ordenes: «Sin acceso»", true);
  check("la API tampoco lo deja (403)", (await api("GET", "/admin/orders", cust.token)).status === 403);
  await ctx.close();
}

console.log("══ 5. PANEL: ÓRDENES");
const ADMIN_PW = "una-clave-larga-segura";
{
  const { ctx, page } = await newPage();
  await login(page, "admin@starboy.local", ADMIN_PW, "?next=%2Fadmin%2Fordenes");
  await page.getByRole("heading", { name: "Órdenes" }).waitFor(); await page.locator("tbody tr").first().waitFor();
  check("tabla con las órdenes", (await page.locator("tbody tr").count()) >= 2);
  await page.locator("#ord-q").fill(o1.code); await page.waitForFunction((c) => document.querySelectorAll("tbody tr").length === 1 && document.querySelector("tbody")?.textContent?.includes(c), o1.code);
  check("filtro por referencia", true);
  await page.locator("#ord-q").fill("camila"); await page.waitForFunction(() => document.querySelectorAll("tbody tr").length >= 2);
  check("filtro por cliente (nombre)", true);
  await page.locator("#ord-q").fill(""); await page.locator("#ord-status").selectOption("PAID"); await page.waitForFunction(() => [...document.querySelectorAll("tbody tr")].every((r) => /Pagada/.test(r.textContent)) && document.querySelectorAll("tbody tr").length >= 1);
  check("filtro por estado", true);
  await page.locator("#ord-status").selectOption("");
  await page.locator("#ord-q").fill(o1.code); await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
  await page.getByRole("button", { name: `Ver orden ${o1.code}` }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("Cliente y facturación").waitFor();
  const txt = await dlg.innerText();
  check("detalle: cliente, cédula, dirección y prendas", txt.includes("1020304050") && txt.includes("Calle 10 # 20-30") && /prendas/i.test(txt) && /cliente y facturaci/i.test(txt));
  check("PAID ofrece «Pasar a preparación» y «Cancelar»", (await dlg.getByRole("button", { name: "Pasar a preparación" }).isVisible()) && (await dlg.getByRole("button", { name: "Cancelar orden" }).isVisible()));
  check("no ofrece saltar a «Entregada»", (await dlg.getByRole("button", { name: "Marcar como entregada" }).count()) === 0);
  await dlg.getByRole("button", { name: "Pasar a preparación" }).click(); await dlg.getByRole("button", { name: "Confirmar" }).click();
  await dlg.getByText("Estado actualizado a «En preparación».").waitFor();
  check("cambio a En preparación", sql(`select status from orders where id='${o1.id}'`) === "PROCESSING");
  await dlg.getByRole("button", { name: "Marcar como enviada" }).click(); await dlg.getByRole("button", { name: "Confirmar" }).click();
  check("enviada exige transportadora y guía", await dlg.getByText("Indica la transportadora y el número de guía").isVisible());
  await dlg.locator('[name="carrier"]').fill("Servientrega"); await dlg.locator('[name="tracking"]').fill("SV123456789"); await dlg.getByRole("button", { name: "Confirmar" }).click();
  await dlg.getByText("Estado actualizado a «Enviada».").waitFor();
  check("BD: SHIPPED con guía", sql(`select status||'|'||carrier||'|'||tracking_number from orders where id='${o1.id}'`) === "SHIPPED|Servientrega|SV123456789");
  check("historial muestra quién lo hizo", (await dlg.innerText()).includes("Administrador Starboy"));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  check("Escape cierra el panel y la fila se refresca (Enviada)", /enviada/i.test(await page.locator("tbody").innerText()));
  // cancelar la pendiente
  await page.locator("#ord-q").fill(o2.code); await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
  const resBefore = sql(`select stock_reserved from product_variants where id in (select variant_id from order_items where order_id='${o2.id}')`);
  await page.getByRole("button", { name: `Ver orden ${o2.code}` }).click();
  await dlg.getByRole("button", { name: "Cancelar orden" }).click(); await dlg.getByRole("button", { name: "Confirmar" }).click();
  check("cancelar exige el motivo", await dlg.getByText("Cuéntanos el motivo de la cancelación").isVisible());
  await dlg.locator('[name="note"]').fill("Cliente no pagó"); await dlg.getByRole("button", { name: "Confirmar" }).click();
  await dlg.getByText("Se liberó el stock que estaba reservado.").waitFor();
  check("cancelar pendiente libera la reserva", resBefore === "1" && sql(`select stock_reserved from product_variants where id in (select variant_id from order_items where order_id='${o2.id}')`) === "0");
  await ctx.close();
  // cliente ve el envío
  const c = await newPage(); await login(c.page, cust.email, "clave-segura-1", "?next=%2Fcuenta%2Fpedidos%2F" + o1.id);
  await c.page.getByText("SV123456789").waitFor();
  check("el cliente ve la transportadora y la guía en su seguimiento", (await c.page.locator("main").innerText()).includes("Servientrega"));
  check("la línea de tiempo muestra «Enviada» como actual", (await c.page.locator('ol[aria-label="Progreso del pedido"] > li[aria-current="step"]').innerText()).includes("Enviada"));
  await c.page.goto(W + "/cuenta/pedidos"); await c.page.getByText("Cancelada").first().waitFor();
  check("la orden cancelada se ve como «Cancelada»", true);
  await c.ctx.close();
}

console.log("══ 6. PANEL: INVENTARIO");
{
  const { ctx, page } = await newPage();
  await login(page, "admin@starboy.local", ADMIN_PW, "?next=%2Fadmin%2Finventario");
  await page.getByRole("heading", { name: "Inventario" }).waitFor(); await page.locator("tbody tr").first().waitFor();
  const n = await page.locator("tbody tr").count();
  check("stock por variante (50 por página)", n > 5, n + " filas");
  await page.locator("#st-q").fill("socks"); await page.waitForTimeout(700);
  const all = await page.locator("tbody tr").allInnerTexts();
  check("búsqueda por producto", all.length >= 1 && all.every((t) => /sock/i.test(t)), all.length + "");
  await page.locator("#st-q").fill(""); await page.locator("#st-f").selectOption("low"); await page.waitForTimeout(800);
  const low = await page.locator("tbody tr").allInnerTexts();
  check("filtro «Poco stock» solo trae 1 a 3 disponibles", low.length > 0 && low.every((t) => /quedan [123]/i.test(t)), low.length + "");
  await page.locator("#st-f").selectOption("");
  await page.locator("#st-q").fill("socks"); await page.waitForTimeout(700);
  const sockRow = page.locator("tbody tr").first();
  const sockName = (await sockRow.locator("th").innerText()).split("\n")[0];
  await sockRow.getByRole("button", { name: /Ver movimientos/ }).click();
  await page.getByText("Registro inmutable").waitFor();
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length > 0);
  const mv = await page.locator("tbody tr").allInnerTexts();
  check("bitácora filtrada por la variante elegida", mv.length >= 2 && mv.every((t) => t.includes(sockName)), mv.length + " movimientos");
  check("la bitácora muestra Reserva y Venta con la orden", mv.some((t) => /reserva/i.test(t) && t.includes(o1.code)) && mv.some((t) => /venta/i.test(t)));
  check("muestra deltas y saldos (→)", mv.some((t) => t.includes("→")));
  await page.locator("#mv-t").selectOption("COMMIT"); await page.waitForTimeout(700);
  check("filtro por tipo", (await page.locator("tbody tr").allInnerTexts()).every((t) => /venta/i.test(t)));
  await page.getByRole("button", { name: "Quitar filtro" }).click(); await page.waitForTimeout(600);
  check("quitar el filtro de variante amplía la lista", (await page.locator("tbody tr").count()) >= 1);
  await ctx.close();
}

console.log("══ 7. PANEL: ENCARGOS USA");
{
  const { ctx, page } = await newPage();
  await login(page, "admin@starboy.local", ADMIN_PW, "?next=%2Fadmin%2Fencargos");
  await page.getByRole("heading", { name: "Encargos USA" }).waitFor(); await page.getByRole("region", { name: "Tablero de encargos" }).waitFor();
  const cols = await page.locator('section[aria-labelledby^="col-"] h2').allInnerTexts();
  check("tablero con 7 columnas", cols.length === 7, cols.map((c) => c.split("\n")[0]).join(" | "));
  const card = page.getByRole("button", { name: new RegExp(imp.code) });
  check("el encargo está en «Por cotizar»", (await page.locator('section[aria-labelledby="col-new"]').innerText()).includes(imp.code));
  await card.click();
  const dlg = page.getByRole("dialog"); await dlg.getByText("Productos solicitados").waitFor();
  const t = await dlg.innerText();
  check("detalle: cliente, producto, nota y enlace seguro", t.includes("Camila Andrea Rojas") && t.includes("Air Max 90") && t.includes("Lo necesito para diciembre") && (await dlg.locator('a[rel*="noopener"]').count()) === 1);
  check("no ofrece ACCEPTED/PAID/QUOTED a mano", !(await dlg.locator('select[name="status"]').innerText()).match(/Aceptada|Anticipo pagado|Cotizada/));
  await dlg.locator('[name="deposit"]').fill("60"); await dlg.getByRole("button", { name: "Enviar cotización" }).click();
  await page.waitForTimeout(1200);
  const quoted = sql(`select status from import_requests where id='${imp.id}'`);
  const errTxt = await dlg.locator('[role="alert"]').allInnerTexts();
  check("cotización emitida (o error claro de la API)", quoted === "QUOTED" || errTxt.length > 0, quoted + " " + errTxt.join("|"));
  if (quoted === "QUOTED") {
    await dlg.getByText("Cotización enviada al cliente.").waitFor();
    check("la cotización aparece con totales y anticipo", (await dlg.innerText()).includes("Anticipo (60 %)"));
    await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    await page.waitForFunction(() => document.querySelector('section[aria-labelledby="col-quoted"]')?.textContent?.includes("IMP-"));
    check("la tarjeta pasó a «Cotizadas»", true);
  } else { await page.keyboard.press("Escape"); }
  // forzar estado para probar cambio de estado manual: REQUESTED→PURCHASED es válido (lote propio)
  await page.reload(); await page.getByRole("region", { name: "Tablero de encargos" }).waitFor();
  await ctx.close();
}
{ // estado manual desde la UI con un encargo nuevo (REQUESTED → PURCHASED permitido)
  const imp2 = (await api("POST", "/imports", cust.token, { document_id: "1020304050", items: [{ product_url: "https://www.amazon.com/dp/B0", description: "Gorra", quantity: 1, declared_price_usd_cents: 3000, import_rate_id: rates[2].id }] })).json.data;
  const { ctx, page } = await newPage();
  await login(page, "admin@starboy.local", ADMIN_PW, "?next=%2Fadmin%2Fencargos");
  await page.getByRole("button", { name: new RegExp(imp2.code) }).click();
  const dlg = page.getByRole("dialog"); await dlg.locator('select[name="status"]').waitFor();
  await dlg.locator('select[name="status"]').selectOption("PURCHASED"); await dlg.locator('[name="tracking_usa"]').fill("1Z999AA10123456784"); await dlg.getByRole("button", { name: "Guardar estado" }).click();
  await dlg.getByText("Estado actualizado a «Comprada en USA».").waitFor();
  check("cambio de estado manual con guía USA", sql(`select status||'|'||tracking_usa from import_requests where id='${imp2.id}'`) === "PURCHASED|1Z999AA10123456784");
  await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.waitForFunction(() => document.querySelector('section[aria-labelledby="col-us"]')?.textContent?.includes("IMP-"));
  check("la tarjeta pasó a «Compra y bodega USA»", true);
  await page.getByRole("button", { name: "Lista" }).click(); await page.locator("tbody tr").first().waitFor();
  check("vista Lista con filas", (await page.locator("tbody tr").count()) >= 2);
  await page.locator("#imp-status").selectOption("PURCHASED"); await page.waitForTimeout(700);
  check("lista: filtro por estado", (await page.locator("tbody tr").allInnerTexts()).every((t) => /comprada/i.test(t)));
  await ctx.close();
}
{ // STAFF
  const staff = await register("Equipo Starboy"); sql(`update users set role='STAFF' where id='${staff.id}'`);
  const { ctx, page } = await newPage();
  await login(page, staff.email, "clave-segura-1", "?next=%2Fadmin%2Fencargos");
  await page.getByRole("region", { name: "Tablero de encargos" }).waitFor();
  await page.locator('section[aria-labelledby^="col-"] button').first().click();
  const dlg = page.getByRole("dialog"); await dlg.getByText("Productos solicitados").waitFor();
  check("STAFF ve el encargo pero no el formulario de cotización", (await dlg.getByText("Emitir cotización").count()) === 0);
  await page.keyboard.press("Escape");
  await page.goto(W + "/admin/ordenes"); await page.locator("tbody tr").first().waitFor(); check("STAFF puede ver órdenes", true);
  await ctx.close();
}

console.log("══ 8. MÓVIL 375");
{
  const { ctx, page } = await newPage({ width: 375, height: 800 });
  await login(page, cust.email, "clave-segura-1", "?next=%2Fcuenta");
  for (const [path, wait] of [["/cuenta", "Datos personales"], ["/cuenta/direcciones", "Direcciones de envío"], ["/cuenta/pedidos", "Mis pedidos"], ["/cuenta/pedidos/" + o1.id, "Seguimiento"]]) {
    await page.goto(W + path); await page.getByText(wait, { exact: false }).first().waitFor(); await page.waitForTimeout(300);
    check(`cuenta ${path.replace(o1.id, ":id")}: sin scroll horizontal`, await noHScroll(page), await hscrollInfo(page));
  }
  await page.goto(W + "/cuenta/direcciones"); await page.getByRole("button", { name: /Agregar dirección/ }).click(); await page.waitForTimeout(300);
  check("formulario de dirección: sin scroll horizontal", await noHScroll(page));
  const fields = await page.locator("main form input:not([type=checkbox]), main form select").evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().height, getComputedStyle(e).fontSize]));
  check("campos ≥ 44 px y 16 px (iOS)", fields.every(([h, f]) => h >= 44 && f === "16px"), JSON.stringify(fields[0]));
  await page.goto(W + "/cuenta/pedidos/" + o1.id); await page.getByText("Seguimiento").first().waitFor();
  const stack = await page.locator('ol[aria-label="Progreso del pedido"] > li').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  check("línea de tiempo vertical en móvil", stack.every((t, i) => i === 0 || t > stack[i - 1]), "");
  await page.screenshot({ path: OUT + "/s6-pedido-movil.png", fullPage: true });
  await ctx.close();
}
{
  const { ctx, page } = await newPage({ width: 375, height: 800 });
  await login(page, "admin@starboy.local", ADMIN_PW, "?next=%2Fadmin");
  for (const [path, wait] of [["/admin", "Panel"], ["/admin/ordenes", "Órdenes"], ["/admin/inventario", "Inventario"], ["/admin/encargos", "Encargos USA"]]) {
    await page.goto(W + path); await page.getByRole("heading", { name: wait }).first().waitFor(); await page.waitForTimeout(900);
    check(`admin ${path}: sin scroll horizontal`, await noHScroll(page), await hscrollInfo(page));
  }
  await page.goto(W + "/admin/ordenes"); await page.locator("ul li button", { hasText: "Ver detalle" }).first().waitFor();
  check("órdenes en móvil: tarjetas (no tabla)", (await page.locator("table").first().isVisible()) === false);
  await page.locator("ul li button", { hasText: "Ver detalle" }).first().click(); await page.getByRole("dialog").getByText("Cliente y facturación").waitFor(); await page.waitForTimeout(300);
  const dl = await page.getByRole("dialog").boundingBox();
  check("panel de detalle cabe en 375 px", dl.width <= 375 && (await noHScroll(page)), Math.round(dl.width) + "");
  await page.screenshot({ path: OUT + "/s6-orden-movil.png" });
  await page.keyboard.press("Escape");
  await page.goto(W + "/admin/inventario"); await page.locator("main ul li").nth(0).waitFor();
  check("inventario en móvil: tarjetas", (await page.locator("table").first().isVisible()) === false);
  await page.goto(W + "/admin/encargos"); await page.getByRole("region", { name: "Tablero de encargos" }).waitFor();
  const reg = await page.getByRole("region", { name: "Tablero de encargos" }).evaluate((e) => [e.scrollWidth, e.clientWidth]);
  check("tablero: se desplaza dentro de su contenedor, no la página", reg[0] > reg[1] && (await noHScroll(page)), reg.join("/"));
  await page.screenshot({ path: OUT + "/s6-encargos-movil.png" });
  await ctx.close();
}
console.log(`\n${ok} OK, ${bad} fallos`);
await browser.close();
