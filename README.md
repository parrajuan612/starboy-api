# Starboy

E-commerce colombiano de streetwear con **Encargos USA**. Monorepo:

| Carpeta | Qué es |
|---------|--------|
| `apps/api` | Backend Go 1.25 + Gin + GORM + PostgreSQL 16 |
| `apps/web` | Frontend Next.js 16 (App Router) + React 19 + Tailwind v4 |
| `SSD.md` | **Fuente de verdad** (especificación). Lee primero el §16: estado actual y hoja de ruta |
| `docker-compose.yml` | PostgreSQL 16 local (puerto host 5434) |

## Arranque rápido (local)

```bash
# 1. Base de datos
docker compose up -d postgres

# 2. API (puerto 8082 para que coincida con apps/web/.env.example)
cd apps/api
cp .env.example .env          # edita secretos JWT y HTTP_PORT=8082
go run ./cmd/migrate -seed    # esquema + admin + catálogo demo (idempotente)
go run ./cmd/server

# 3. Web
cd apps/web
cp .env.example .env.local
npm ci
npm run dev
```

Admin de desarrollo (seed): `admin@starboy.local` / `una-clave-larga-segura`. **Solo desarrollo.**

## Verificación

```bash
cd apps/api && gofmt -l . && go build ./... && go vet ./... && go test ./...
cd apps/web && npx tsc --noEmit && npm run lint && npm run build
```

## Desplegar en un servidor

`docker-compose.prod.yml` levanta todo (Postgres + API + Web + Caddy con HTTPS). Guía completa para Oracle Cloud u otro: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

```bash
bash infra/scripts/init-env.sh tienda.midominio.com correo-del-admin@gmail.com staging   # genera .env con secretos
docker compose -f docker-compose.prod.yml up -d --build
```

Para continuar el desarrollo en otra máquina, empieza por **SSD.md §16**.
