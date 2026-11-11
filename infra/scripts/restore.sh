#!/usr/bin/env bash
# Restaura un respaldo (BORRA lo que hay ahora). Uso:
#   CONFIRM=yes bash infra/scripts/restore.sh backups/db-AAAA.sql.gz backups/uploads-AAAA.tgz
set -euo pipefail
cd "$(dirname "$0")/../.."
[ "${CONFIRM:-}" = "yes" ] || { echo "Esto reemplaza la base y las fotos actuales. Repite con CONFIRM=yes."; exit 1; }
DB="${1:?Falta el archivo db-*.sql.gz}"; UP="${2:?Falta el archivo uploads-*.tgz}"
COMPOSE="docker compose -f docker-compose.prod.yml"

$COMPOSE stop api web caddy
$COMPOSE exec -T postgres psql -U starboy -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS starboy_db" -c "CREATE DATABASE starboy_db OWNER starboy"
gunzip -c "$DB" | $COMPOSE exec -T postgres psql -U starboy -d starboy_db -v ON_ERROR_STOP=1 -q
$COMPOSE run --rm --no-deps -T --entrypoint sh api -c "rm -rf /data/uploads/* && tar xzf - -C /data/uploads" < "$UP"
$COMPOSE up -d
echo "Restauración completa."
