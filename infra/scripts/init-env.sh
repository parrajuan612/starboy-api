#!/usr/bin/env bash
# Genera el `.env` del servidor con secretos aleatorios.
#   bash infra/scripts/init-env.sh <SITE_ADDRESS> <correo_del_admin> [staging|production]
# Ejemplos:
#   bash infra/scripts/init-env.sh tienda.midominio.com cliente@correo.com staging
#   bash infra/scripts/init-env.sh 129-153-10-20.sslip.io cliente@correo.com      # IP 129.153.10.20 sin dominio
set -euo pipefail
cd "$(dirname "$0")/../.."

SITE="${1:-}"; ADMIN="${2:-}"; ENVNAME="${3:-staging}"
if [ -z "$SITE" ] || [ -z "$ADMIN" ]; then
  echo "Uso: bash infra/scripts/init-env.sh <SITE_ADDRESS> <correo_del_admin> [staging|production]"; exit 1
fi
case "$ENVNAME" in staging|production) ;; *) echo "El entorno debe ser staging o production"; exit 1;; esac
if [ -e .env ]; then echo "Ya existe .env: no se sobrescribe. Bórralo o edítalo a mano."; exit 1; fi
command -v openssl >/dev/null || { echo "Falta openssl"; exit 1; }

secret() { openssl rand -hex 32; }
ADMIN_PASS="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20)"
if [ "$SITE" = ":80" ]; then BASE="http://localhost"; else BASE="https://$SITE"; fi
PROVIDERS="SANDBOX"; [ "$ENVNAME" = "production" ] && PROVIDERS=""

umask 077
sed \
  -e "s|^APP_ENV=.*|APP_ENV=$ENVNAME|" \
  -e "s|^SITE_ADDRESS=.*|SITE_ADDRESS=$SITE|" \
  -e "s|^WEB_BASE_URL=.*|WEB_BASE_URL=$BASE|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secret)|" \
  -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(secret)|" \
  -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(secret)|" \
  -e "s|^PAYMENT_WEBHOOK_SECRET=.*|PAYMENT_WEBHOOK_SECRET=$(secret)|" \
  -e "s|^SEED_ADMIN_EMAIL=.*|SEED_ADMIN_EMAIL=$ADMIN|" \
  -e "s|^SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=$ADMIN_PASS|" \
  -e "s|^PAYMENT_PROVIDERS=.*|PAYMENT_PROVIDERS=$PROVIDERS|" \
  .env.prod.example > .env

echo "Listo: se creó .env (permisos 600)."
echo
echo "  Sitio:          $BASE"
echo "  Administrador:  $ADMIN"
echo "  Contraseña:     $ADMIN_PASS      ← guárdala ahora; también queda en .env (SEED_ADMIN_PASSWORD)"
echo
echo "Siguiente: docker compose -f docker-compose.prod.yml up -d --build"
