// Corre las pruebas de navegador una tras otra y resume el resultado.
//   npm run e2e                 → todas (menos las que piden configuración extra)
//   npm run e2e -- imports      → solo una
// Requiere el stack local levantado (ver e2e/README.md).
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const ALL = readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".mjs") && !["env.mjs", "run.mjs"].includes(f)).map((f) => f.replace(".mjs", "")).sort();
const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : ALL.filter((n) => n !== "checkout" || process.env.RESTART_API_CMD);
let failed = 0;
for (const n of names) {
  if (!ALL.includes(n)) { console.error(`No existe «${n}». Disponibles: ${ALL.join(", ")}`); process.exit(2); }
  console.log(`\n████ ${n}`);
  const r = spawnSync("node", [new URL(`./${n}.mjs`, import.meta.url).pathname], { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(r.stdout);
  const m = /(\d+) OK, (\d+) fallos?/.exec(r.stdout);
  const bad = r.status !== 0 || !m || Number(m[2]) > 0;
  console.log(bad ? `✘ ${n}: ${m ? `${m[2]} fallos` : "no terminó bien"}` : `✔ ${n}: ${m[1]} comprobaciones`);
  if (bad) failed++;
}
console.log(`\n${failed ? `✘ ${failed} grupo(s) con fallos` : "✔ Todo en verde"}`);
process.exit(failed ? 1 : 0);
