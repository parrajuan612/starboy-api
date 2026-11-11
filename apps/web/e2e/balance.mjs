import { chromium } from "playwright-core";
import { W, API, CHROME, OUT, sql } from "./env.mjs";

// Pago del saldo de un encargo, bloqueo de despacho sin saldo, re-cotización, página de retorno de la pasarela y bandeja de pagos.
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
let ok = 0, bad = 0;
const check = (n, c, x = "") => { (c ? ok++ : bad++); console.log(`${c ? "✔" : "✘"} ${n}${x !== "" ? "  → " + x : ""}`); };
// La API limita a 10 por minuto por IP los cobros y las escrituras de encargos: el guion se espacia solo.
const windows = { pay: [], imp: [] };
const limitKey = (method, path) => method !== "POST" ? null : path === "/payments/checkout" ? "pay" : (path === "/imports" || /^\/imports\/[^/]+\/(requote|quotes\/[^/]+\/accept)$/.test(path)) ? "imp" : null;
const spaced = async (key) => { const w = windows[key]; const now = Date.now(); while (w.length && now - w[0] > 61000) w.shift(); if (w.length >= 9) { await new Promise((r) => setTimeout(r, 61000 - (now - w[0]))); w.shift(); } w.push(Date.now()); };
const api = async (method, path, token, body) => {
  const k = limitKey(method, path); if (k) await spaced(k);
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); return { status: r.status, json: t ? JSON.parse(t) : null };
};
const authTimes = [];
const throttle = async () => { const now = Date.now(); while (authTimes.length && now - authTimes[0] > 61000) authTimes.shift(); if (authTimes.length >= 9) { await new Promise((r) => setTimeout(r, 61000 - (now - authTimes[0]))); authTimes.shift(); } authTimes.push(Date.now()); };
const register = async (name) => {
  await throttle();
  const email = `bal${Date.now()}${Math.floor(Math.random() * 999)}@example.com`;
  const r = await api("POST", "/auth/register", null, { email, password: "clave-segura-1", full_name: name, document_id: "1020304050" });
  return { email, token: r.json.data.access_token, id: r.json.data.user.id };
};
const asUser = async (email, password = "clave-segura-1", vp = { width: 1280, height: 900 }) => {
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
const cop = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n).replace(/\s/g, " ");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await throttle();
const adminTok = (await api("POST", "/auth/login", null, { email: "admin@starboy.local", password: "una-clave-larga-segura" })).json.data.access_token;
const rates = (await api("GET", "/imports/rates")).json.data;
const rate = rates.find((r) => /sneakers/i.test(r.name));
const C1 = await register("Camila Saldo"), C2 = await register("Otra Persona");

// ── ayudantes de flujo (por API: lo que se prueba aquí es el saldo, no el formulario de solicitud)
const newImport = async (user, desc = "Jordan 1 Retro") => (await api("POST", "/imports", user.token, { items: [{ product_url: "https://www.nike.com/x", description: desc, quantity: 1, declared_price_usd_cents: 15000, import_rate_id: rate.id }] })).json.data;
const quote = async (id, body = {}) => (await api("POST", `/admin/imports/${id}/quotes`, adminTok, body)).json.data;
const payPending = async (user, id, outcome = "approved") => {
  const p = (await api("POST", "/payments/checkout", user.token, { import_request_id: id })).json.data;
  return { p, sim: await api("POST", `/payments/${p.id}/simulate`, user.token, { outcome }) };
};
const toBalanceDue = async (user, { cod = false, deposit } = {}) => {
  const imp = await newImport(user);
  const q = (await quote(imp.id, { ...(cod ? { balance_cod_allowed: true } : {}), ...(deposit ? { deposit_percent: deposit } : {}) })).quote;
  await api("POST", `/imports/${imp.id}/quotes/${q.id}/accept`, user.token);
  await payPending(user, imp.id);
  for (const s of ["PURCHASED", "IN_US_WAREHOUSE", "IN_TRANSIT", "IN_CO_WAREHOUSE", "BALANCE_DUE"]) await api("PATCH", `/admin/imports/${imp.id}/status`, adminTok, { status: s });
  return { id: imp.id, code: imp.code, quote: q };
};

console.log("══ 1. PASARELAS HABILITADAS");
{
  const r = await api("GET", "/payments/providers");
  check("GET /payments/providers lista solo lo habilitado", r.status === 200 && JSON.stringify(r.json.data) === '["SANDBOX"]', JSON.stringify(r.json.data));
}

console.log("══ 2. SALDO: COBRO Y BLOQUEO DE DESPACHO (API)");
const A = await toBalanceDue(C1);
{
  const before = (await api("GET", `/imports/${A.id}`, C1.token)).json.data;
  check("en «Saldo pendiente» y balance_paid = false", before.status === "BALANCE_DUE" && before.balance_paid === false);
  const adm = (await api("GET", `/admin/imports/${A.id}`, adminTok)).json.data;
  check("el panel ve que el saldo bloquea el despacho", adm.balance_blocks_dispatch === true && adm.balance_paid === false);
  const co = await api("POST", "/payments/checkout", C1.token, { import_request_id: A.id });
  check("checkout en BALANCE_DUE abre un cobro de tipo BALANCE por el saldo de la cotización", co.status === 201 && co.json.data.kind === "BALANCE" && co.json.data.amount_cop === A.quote.balance_cop, `${co.json.data.kind} ${co.json.data.amount_cop} / ${A.quote.balance_cop}`);
  const co2 = await api("POST", "/payments/checkout", C1.token, { import_request_id: A.id });
  check("repetir el checkout reutiliza el cobro pendiente (no duplica)", co2.json.data.id === co.json.data.id && sql(`select count(*) from payments where import_request_id='${A.id}' and kind='BALANCE'`) === "1");
  check("otro cliente no puede cobrar el saldo ajeno (404)", (await api("POST", "/payments/checkout", C2.token, { import_request_id: A.id })).status === 404);
  const blocked = await api("PATCH", `/admin/imports/${A.id}/status`, adminTok, { status: "OUT_FOR_DELIVERY" });
  check("despachar SIN saldo → 409 BALANCE_NOT_PAID con el monto", blocked.status === 409 && blocked.json.error.code === "BALANCE_NOT_PAID" && blocked.json.error.message.includes(cop(A.quote.balance_cop).replace(/\s/g, " ").replace("$ ", "$")), blocked.json.error?.message);
  check("…y el estado no cambió", sql(`select status from import_requests where id='${A.id}'`) === "BALANCE_DUE");
}

console.log("══ 3. SALDO: PAGO EN LA WEB (UI cliente)");
{
  const { ctx, page } = await asUser(C1.email);
  await page.goto(W + `/cuenta/encargos/${A.id}`);
  await page.getByRole("button", { name: /Pagar saldo de/ }).waitFor();
  check("el cliente ve «Pagar saldo» con el monto exacto", (await txt(page)).replace(/\s/g, " ").includes(cop(A.quote.balance_cop)));
  check("375px: detalle con saldo sin scroll horizontal", await (async () => { await page.setViewportSize({ width: 375, height: 800 }); const r = await noH(page); await page.screenshot({ path: OUT + "/bal-saldo-movil.png", fullPage: true }); await page.setViewportSize({ width: 1280, height: 900 }); return r; })());
  await page.getByRole("button", { name: /Pagar saldo de/ }).click();
  await page.waitForURL(/\/pago\/sandbox\//, { timeout: 15000 });
  await page.getByText("Saldo a pagar").waitFor();
  const pt = (await txt(page)).replace(/\s/g, " ");
  check("pasarela: «Saldo a pagar», el código del encargo y el monto", pt.includes(A.code) && pt.includes(cop(A.quote.balance_cop)));
  await page.getByRole("button", { name: /Simular pago aprobado/i }).click();
  await page.waitForURL(/\/cuenta\/encargos\/.*pago=aprobado/, { timeout: 15000 });
  await page.getByText(/Recibimos tu saldo de/).first().waitFor();
  check("vuelve al encargo: «Recibimos tu saldo… preparando el despacho»", true);
  check("ya no ofrece pagar el saldo", await page.getByRole("button", { name: /Pagar saldo/ }).count() === 0);
  check("BD: pago BALANCE aprobado por el monto y el estado SIGUE en BALANCE_DUE (el despacho lo registra el equipo)", sql(`select count(*) from payments where import_request_id='${A.id}' and kind='BALANCE' and status='APPROVED' and amount_cop=${A.quote.balance_cop}`) === "1" && sql(`select status from import_requests where id='${A.id}'`) === "BALANCE_DUE");
  check("historial con la nota del saldo para el cliente", Number(sql(`select count(*) from import_status_history where import_request_id='${A.id}' and status='BALANCE_DUE' and note like 'Recibimos tu saldo%' and notify_customer`)) === 1);
  const again = await api("POST", "/payments/checkout", C1.token, { import_request_id: A.id });
  check("pagar el saldo dos veces → 409 ALREADY_PAID", again.status === 409 && again.json.error.code === "ALREADY_PAID");
  const adm = (await api("GET", `/admin/imports/${A.id}`, adminTok)).json.data;
  check("el panel ya no ve bloqueo y balance_paid = true", adm.balance_blocks_dispatch !== true && adm.balance_paid === true);
  const ship = await api("PATCH", `/admin/imports/${A.id}/status`, adminTok, { status: "OUT_FOR_DELIVERY", tracking_co: "SERV-123", note: "Sale hoy" });
  check("con el saldo pagado, el equipo SÍ puede despachar", ship.status === 200 && ship.json.data.status === "OUT_FOR_DELIVERY");
  await page.goto(W + `/cuenta/encargos/${A.id}`); await page.getByText("SERV-123").waitFor();
  check("el cliente ve «En reparto» y la guía", /En reparto/i.test(await txt(page)));
  await ctx.close();
}

console.log("══ 4. SALDO: CONFIRMACIÓN MANUAL Y CONTRA ENTREGA");
const B = await toBalanceDue(C1);
const Cod = await toBalanceDue(C1, { cod: true, deposit: 50 });
{
  const { ctx, page } = await asUser("admin@starboy.local", "una-clave-larga-segura");
  await page.goto(W + "/admin/encargos");
  const badge = page.getByText("Saldo por pagar").first();
  await badge.waitFor({ timeout: 10000 });
  check("el tablero marca «Saldo por pagar» en los encargos que lo bloquean", await page.getByText("Saldo por pagar").count() >= 1);
  await page.getByText(B.code).first().click();
  await page.getByText(/Falta el saldo de/).waitFor();
  check("el detalle explica que falta el saldo", true);
  await page.locator('select[name="status"]').selectOption("OUT_FOR_DELIVERY");
  await page.waitForSelector("text=Confirmo que recibí el saldo");
  await page.getByRole("button", { name: "Guardar estado" }).click();
  check("sin marcar la confirmación: error y no cambia el estado", /Confirma que recibiste el saldo/.test(await page.locator("dialog").innerText()) && sql(`select status from import_requests where id='${B.id}'`) === "BALANCE_DUE");
  await page.getByLabel(/Confirmo que recibí el saldo/).check();
  await page.getByRole("button", { name: "Guardar estado" }).click();
  await page.getByText(/Estado actualizado/).waitFor({ timeout: 10000 });
  check("confirmado: pasa a «En reparto» y queda la excepción en el historial", sql(`select status from import_requests where id='${B.id}'`) === "OUT_FOR_DELIVERY" && Number(sql(`select count(*) from import_status_history where import_request_id='${B.id}' and note like 'Saldo confirmado por el equipo%'`)) === 1);
  await ctx.close();

  const codView = (await api("GET", `/admin/imports/${Cod.id}`, adminTok)).json.data;
  check("contra entrega acordado: el saldo NO bloquea el despacho", codView.balance_blocks_dispatch !== true);
  const c = await (async () => { const u = await asUser(C1.email); await u.page.goto(W + `/cuenta/encargos/${Cod.id}`); await u.page.getByText(/contra entrega/i).first().waitFor(); return u; })();
  check("el cliente ve «lo pagas contra entrega» y NO el botón de pagar", await c.page.getByRole("button", { name: /Pagar saldo/ }).count() === 0);
  await c.ctx.close();
  check("el equipo despacha sin confirmación extra", (await api("PATCH", `/admin/imports/${Cod.id}/status`, adminTok, { status: "OUT_FOR_DELIVERY" })).status === 200);
}

console.log("══ 5. RE-COTIZACIÓN");
{
  const imp = await newImport(C1, "Gorra New Era");
  const q = (await quote(imp.id)).quote;
  check("con la cotización vigente: pedir una nueva → 409 REQUOTE_NOT_NEEDED", (await api("POST", `/imports/${imp.id}/requote`, C1.token)).json.error.code === "REQUOTE_NOT_NEEDED");
  sql(`update import_quotes set valid_until = now() - interval '1 hour' where import_request_id='${imp.id}'`);
  check("encargo ajeno → 404", (await api("POST", `/imports/${imp.id}/requote`, C2.token)).status === 404);
  const { ctx, page } = await asUser(C1.email);
  await page.goto(W + `/cuenta/encargos/${imp.id}`);
  await page.getByRole("button", { name: /Pedir una nueva cotización/ }).waitFor();
  check("cotización vencida: botón «Pedir una nueva cotización» y no se puede aceptar", await page.getByRole("button", { name: /Aceptar/ }).count() === 0);
  await page.getByRole("button", { name: /Pedir una nueva cotización/ }).click();
  await page.getByText(/Pediste una nueva cotización el/).first().waitFor();
  check("tras pedirla: aviso con la fecha y sin botón", await page.getByRole("button", { name: /Pedir una nueva cotización/ }).count() === 0);
  check("BD: queda la marca y una nota en el historial", sql(`select (requote_requested_at is not null) from import_requests where id='${imp.id}'`) === "t" && Number(sql(`select count(*) from import_status_history where import_request_id='${imp.id}' and note like 'Pediste una nueva cotización%'`)) === 1);
  check("pedirla otra vez → 409 REQUOTE_ALREADY_REQUESTED", (await api("POST", `/imports/${imp.id}/requote`, C1.token)).json.error.code === "REQUOTE_ALREADY_REQUESTED");
  await ctx.close();
  const lst = (await api("GET", "/admin/imports?q=" + imp.code, adminTok)).json.data[0];
  check("el panel ve la petición (requote_requested_at)", !!lst.requote_requested_at);
  const a = await asUser("admin@starboy.local", "una-clave-larga-segura");
  await a.page.goto(W + "/admin/encargos");
  await a.page.getByText("Pidió nueva cotización").first().waitFor({ timeout: 10000 });
  check("el tablero del panel marca «Pidió nueva cotización»", true);
  await a.ctx.close();
  await quote(imp.id);
  const after = (await api("GET", `/imports/${imp.id}`, C1.token)).json.data;
  check("al emitir la cotización nueva se limpia la petición y vuelve a estar vigente", !after.requote_requested_at && after.quote.version === 2 && after.quote.is_expired === false);
}

console.log("══ 6. PÁGINA DE RETORNO DE LA PASARELA (/pago/retorno)");
{
  const imp = await newImport(C1, "Hoodie");
  const q = (await quote(imp.id)).quote;
  await api("POST", `/imports/${imp.id}/quotes/${q.id}/accept`, C1.token);
  const p = (await api("POST", "/payments/checkout", C1.token, { import_request_id: imp.id })).json.data;
  const { ctx, page } = await asUser(C1.email);
  await page.goto(W + "/pago/retorno");
  await page.getByText(/enlace de retorno está incompleto/i).waitFor();
  check("sin pid: mensaje claro", await page.getByText(/enlace de retorno está incompleto/i).count() === 1);
  await page.goto(W + `/pago/retorno?pid=${p.id}`);
  await page.getByText(/Estamos confirmando tu pago/).waitFor();
  check("pago pendiente: «Estamos confirmando tu pago…»", true);
  const bal = page.waitForURL(/\/cuenta\/encargos\/.*pago=aprobado/, { timeout: 20000 });
  await sleep(1500);
  await api("POST", `/payments/${p.id}/simulate`, C1.token, { outcome: "approved" }); // llega el webhook
  await bal;
  await page.getByText(/Recibimos tu anticipo/).first().waitFor();
  check("cuando llega el webhook aprobado, la página lleva al encargo con aviso", /Anticipo pagado/i.test(await txt(page)));
  await page.goto(W + `/pago/retorno?pid=${p.id}`);
  await page.waitForURL(/pago=aprobado/, { timeout: 15000 });
  check("volver a abrir el retorno de un pago ya aprobado también redirige", true);

  const imp2 = await newImport(C1, "Camiseta");
  const q2 = (await quote(imp2.id)).quote; await api("POST", `/imports/${imp2.id}/quotes/${q2.id}/accept`, C1.token);
  const p2 = (await api("POST", "/payments/checkout", C1.token, { import_request_id: imp2.id })).json.data;
  await api("POST", `/payments/${p2.id}/simulate`, C1.token, { outcome: "declined" });
  await page.goto(W + `/pago/retorno?pid=${p2.id}`);
  await page.getByText(/Tu pago fue rechazado/).waitFor();
  check("pago rechazado: mensaje y botón «Intentar de nuevo»", await page.getByRole("button", { name: "Intentar de nuevo" }).count() === 1);
  await page.getByRole("button", { name: "Intentar de nuevo" }).click();
  await page.waitForURL(/\/pago\/sandbox\//, { timeout: 15000 });
  check("«Intentar de nuevo» abre un cobro nuevo en la pasarela", sql(`select count(*) from payments where import_request_id='${imp2.id}'`) === "2");
  check("375px: la pasarela sin scroll horizontal", await (async () => { await page.setViewportSize({ width: 375, height: 800 }); const r = await noH(page); await page.setViewportSize({ width: 1280, height: 900 }); return r; })());
  await ctx.close();
  const other = await asUser(C2.email);
  await other.page.goto(W + `/pago/retorno?pid=${p.id}`);
  await other.page.getByText(/No encontramos ese pago/).waitFor();
  check("el pago de otra persona no se ve (404)", true);
  check("375px: retorno sin scroll horizontal", await (async () => { await other.page.setViewportSize({ width: 375, height: 800 }); const r = await noH(other.page); return r; })());
  await other.ctx.close();
}

console.log("══ 7. PAGOS EN REVISIÓN Y BANDEJA DE PAGOS (admin)");
{
  // Un pago aprobado por la pasarela cuando el encargo ya no puede avanzar queda EN REVISIÓN (no se pierde ni se inventa un estado).
  const imp = await newImport(C1, "Zapatilla");
  const q = (await quote(imp.id)).quote; await api("POST", `/imports/${imp.id}/quotes/${q.id}/accept`, C1.token);
  const p = (await api("POST", "/payments/checkout", C1.token, { import_request_id: imp.id })).json.data;
  await api("PATCH", `/admin/imports/${imp.id}/status`, adminTok, { status: "CANCELLED" });
  const sim = await api("POST", `/payments/${p.id}/simulate`, C1.token, { outcome: "approved" });
  check("pago aprobado sobre un encargo cancelado → IN_REVIEW", sim.json.data.status === "IN_REVIEW" && sql(`select status from import_requests where id='${imp.id}'`) === "CANCELLED");

  const { ctx, page } = await asUser("admin@starboy.local", "una-clave-larga-segura");
  await page.goto(W + "/admin/pagos"); await page.getByRole("heading", { name: "Pagos" }).waitFor();
  await page.locator("#pay-s").selectOption("IN_REVIEW");
  await page.getByText(imp.code).first().waitFor({ timeout: 10000 });
  check("/admin/pagos con filtro «En revisión» muestra el pago con su código IMP-… y el aviso explicativo", /pasarela aprobó/i.test(await txt(page)) && /Anticipo de encargo/.test(await txt(page)));
  await page.locator("#pay-s").selectOption("");
  await page.waitForTimeout(800);
  const t = await txt(page);
  check("sin filtro: se ven saldos y anticipos con su pasarela", /Saldo de encargo/.test(t) && /Pasarela de pruebas/.test(t) && /Aprobado/.test(t));
  check("375px: bandeja de pagos sin scroll horizontal", await (async () => { await page.setViewportSize({ width: 375, height: 800 }); const r = await noH(page); await page.screenshot({ path: OUT + "/bal-pagos-movil.png", fullPage: true }); return r; })());
  await ctx.close();
  check("la API de pagos del panel es solo ADMIN (cliente → 403)", (await api("GET", "/admin/payments", C1.token)).status === 403);
}

await browser.close();
console.log(`\n${ok} OK, ${bad} fallos`);
