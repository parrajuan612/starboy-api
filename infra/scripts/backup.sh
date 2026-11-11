#!/usr/bin/env bash
# Respaldo de la base de datos y de las fotos subidas. Conserva 14 días.
#   bash infra/scripts/backup.sh            (carpeta ./backups, o BACKUP_DIR=/ruta)
# Programar cada noche:  0 3 * * *  cd /ruta/a/starboy && bash infra/scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/../.."
DIR="${BACKUP_DIR:-./backups}"; mkdir -p "$DIR"; DIR="$(cd "$DIR" && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
COMPOSE="docker compose -f docker-compose.prod.yml"

$COMPOSE exec -T postgres pg_dump -U starboy -d starboy_db | gzip > "$DIR/db-$TS.sql.gz"
# Las fotos se empaquetan desde dentro del contenedor de la API (no depende del nombre del volumen).
$COMPOSE exec -T api tar czf - -C /data/uploads . > "$DIR/uploads-$TS.tgz"
find "$DIR" -name 'db-*.sql.gz' -mtime +14 -delete
find "$DIR" -name 'uploads-*.tgz' -mtime +14 -delete
echo "[$(date -Is)] respaldo listo: db-$TS.sql.gz y uploads-$TS.tgz en $DIR"
