import { chromium } from "playwright-core";
import { W, API, API_ROOT, CHROME, OUT, UPLOAD_DIR, sql } from "./env.mjs";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
let ok = 0, bad = 0;
const check = (n, c, x = "") => { (c ? ok++ : bad++); console.log(`${c ? "✔" : "✘"} ${n}${x !== "" ? "  → " + x : ""}`); };
const prods = (await (await fetch(`${API}/products?limit=1`)).json()).data;
const p = (await (await fetch(`${API}/products/${prods[0].slug}`)).json()).data;
const v = p.variants.find((x) => x.stock_available > 0 || x.available > 0) ?? p.variants[0];
const lines = [{ variantId: v.id, productSlug: p.slug, name: p.name, size: v.size, sku: v.sku, unitPriceCOP: v.price_cop, quantity: 1, imageUrl: p.images[0].url }];

async function mk(addresses) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CO" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(W + "/");
  const email = `pf${Date.now()}${Math.floor(Math.random()*999)}@example.com`;
  const tok = await page.evaluate(async (b) => { const r = await fetch("/api/v1/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return (await r.json()).data.access_token; }, { email, password: "clave-segura-1", full_name: "Camila Andrea Rojas Pérez", phone: "3001234567", document_id: "1020304050" });
  for (const a of addresses) await fetch(API + "/me/addresses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify(a) });
  await ctx.addCookies([{ name: "sb_session", value: "1", url: W }]);
  await page.evaluate((l) => localStorage.setItem("sb-cart", JSON.stringify({ state: { lines: l }, version: 0 })), lines);
  return { ctx, page };
}
const val = (page, n) => page.locator(`[name="${n}"]`).inputValue();

// 1) Dos direcciones, la segunda predeterminada
let { ctx, page } = await mk([
  { label: "Casa", department: "Antioquia", city: "Medellín", line1: "Calle 10 # 20-30", is_default: true },
  { label: "Oficina", department: "Cundinamarca", city: "Bogotá", line1: "Carrera 7 # 71-21", line2: "Torre B", notes: "Portería" },
]);
await page.goto(W + "/checkout"); await page.waitForSelector('[name="first_name"]'); await page.waitForTimeout(800);
check("selector de direcciones guardadas visible", await page.locator('[name="saved_address"]').count() === 1);
check("la predeterminada llena el formulario", (await val(page, "city")) === "Medellín" && (await val(page, "line1")) === "Calle 10 # 20-30" && (await val(page, "department")) === "Antioquia");
check("selector marca la predeterminada", (await page.locator('[name="saved_address"] option:checked').innerText()).includes("predeterminada"));
const opts = await page.locator('[name="saved_address"] option').allInnerTexts();
check("opciones: otra + 2 guardadas", opts.length === 3, opts.join(" | "));
check("datos de contacto intactos", (await val(page, "document_id")) === "1020304050" && (await val(page, "phone")) === "3001234567");
await page.locator('[name="saved_address"]').selectOption({ label: opts[2] });
check("elegir otra guardada la aplica", (await val(page, "city")) === "Bogotá" && (await val(page, "line2")) === "Torre B" && (await val(page, "notes")) === "Portería");
await page.locator('[name="saved_address"]').selectOption("");
check("«Escribir otra» conserva lo escrito (no borra)", (await val(page, "city")) === "Bogotá");
// 2) el borrador gana sobre la predeterminada
await page.locator('[name="line1"]').fill("Dirección editada a mano");
await page.reload(); await page.waitForSelector('[name="first_name"]'); await page.waitForTimeout(800);
check("recargar: el borrador tiene prioridad", (await val(page, "line1")) === "Dirección editada a mano");
// 3) sin direcciones: sin selector, todo vacío
await ctx.close();
({ ctx, page } = await mk([]));
await page.goto(W + "/checkout"); await page.waitForSelector('[name="first_name"]'); await page.waitForTimeout(800);
check("sin direcciones: no hay selector", await page.locator('[name="saved_address"]').count() === 0);
check("sin direcciones: formulario vacío", (await val(page, "line1")) === "");
await ctx.close();
// 4) móvil
({ ctx, page } = await mk([{ label: "Casa", department: "Antioquia", city: "Medellín", line1: "Calle 10 # 20-30", is_default: true }]));
await page.setViewportSize({ width: 375, height: 800 });
await page.goto(W + "/checkout"); await page.waitForSelector('[name="first_name"]'); await page.waitForTimeout(800);
check("375px: sin scroll horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
const h = await page.locator('[name="saved_address"]').evaluate((e) => e.getBoundingClientRect().height);
check("selector ≥ 44px", h >= 44, String(h));
await ctx.close(); await browser.close();
console.log(`\n${ok} OK, ${bad} fallos`);
