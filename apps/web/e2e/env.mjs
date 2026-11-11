// Configuración común de las pruebas de navegador. Todo se puede cambiar con variables de entorno.
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

export const W = process.env.WEB_URL ?? "http://localhost:3465"; // web (next start)
export const API_ROOT = process.env.API_ROOT ?? "http://localhost:8082"; // API de Go
export const API = `${API_ROOT}/api/v1`;
export const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
export const DB_CONTAINER = process.env.DB_CONTAINER ?? "starboy_postgres";
/** Carpeta de fotos de la API (la misma UPLOAD_DIR con la que se levantó). Solo la usa admin-catalog. */
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "";
/** Dónde se guardan las capturas. */
export const OUT = process.env.E2E_OUT ?? `${tmpdir()}/starboy-e2e`;
mkdirSync(OUT, { recursive: true });

/** Consulta SQL de apoyo (verificar la BD y preparar casos). Requiere Docker con el Postgres del proyecto. */
export const sql = (q) =>
  execSync(`docker exec ${DB_CONTAINER} psql -U starboy -d starboy_db -tA -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
