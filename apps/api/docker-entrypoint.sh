#!/bin/sh
# Aplica el esquema y los datos iniciales (idempotente: se puede repetir en cada arranque) y luego levanta la API.
set -e
if [ "$SEED_DEMO" = "true" ]; then
  /app/migrate -seed -seed-demo
else
  /app/migrate -seed
fi
exec /app/server
