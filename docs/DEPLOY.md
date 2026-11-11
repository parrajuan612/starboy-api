# Desplegar Starboy en un servidor (Oracle Cloud u otro)

Guía para dejar el sitio funcionando en una VM con **Docker Compose**. Sirve igual para un servidor de validación
(el cliente carga productos y revisa) que para producción: solo cambia `APP_ENV`.

**Lo que se levanta** (`docker-compose.prod.yml`): Postgres 16 · API (Go) · Web (Next.js) · Caddy (HTTPS automático).
Solo Caddy abre puertos (80 y 443); la base de datos y la API quedan dentro de la red de Docker.

Tiempo estimado la primera vez: **45–60 minutos** (la mayor parte es crear la VM y construir las imágenes).

---

## 1. La VM

| Requisito | Recomendado |
|-----------|-------------|
| Sistema | Ubuntu 22.04 o 24.04 |
| Memoria | **4 GB o más** (construir la web gasta ~2 GB). Con 1 GB (la «Always Free» AMD micro) no alcanza: usa la ARM **Ampere A1** (hasta 24 GB gratis) o añade swap |
| Disco | 30 GB o más |
| Arquitectura | x86 o ARM: todo se construye en la propia VM |

En Oracle Cloud (consola):

1. **Compute → Create instance**: imagen Ubuntu, forma Ampere A1 (2 OCPU / 8–12 GB es de sobra) y sube tu llave SSH.
2. **Red:** en la *Virtual Cloud Network* de la instancia → *Security List* → **Add Ingress Rules**: `0.0.0.0/0`, TCP, puertos **80** y **443**.
3. Anota la **IP pública**.

## 2. Preparar la VM (una sola vez)

```bash
ssh ubuntu@<IP-PUBLICA>

# Docker + Compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Oracle trae un firewall interno (iptables) que bloquea 80/443 aunque la consola los permita. Ábrelos:
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
```

> Si el sitio «no responde» desde fuera, casi siempre es una de estas dos cosas: la regla de la *Security List* o el `iptables`.

## 3. Bajar el código y configurar

```bash
git clone https://github.com/parrajuan612/starboy-api.git starboy && cd starboy
# Si el repositorio es privado: crea un token en GitHub (solo lectura) y usa  git clone https://<token>@github.com/...
```

Genera el `.env` con secretos aleatorios. Elige **cómo se va a abrir el sitio**:

```bash
# A) Tienes un dominio apuntado a la IP (registro A):
bash infra/scripts/init-env.sh tienda.midominio.com correo-del-cliente@gmail.com staging

# B) Sin dominio (HTTPS igual, usando sslip.io): para la IP 129.153.10.20 →
bash infra/scripts/init-env.sh 129-153-10-20.sslip.io correo-del-cliente@gmail.com staging
```

El script imprime **la contraseña del administrador una sola vez** (también queda en `.env`). Guárdala.

Revisa el `.env` por si quieres ajustar algo (`nano .env`). Lo importante:

| Variable | Qué hace |
|----------|----------|
| `APP_ENV` | `staging` = servidor de validación (la pasarela de **pruebas** está activa, para que el cliente pruebe una compra sin dinero real). `production` = sitio real |
| `SEED_DEMO` | `false` = catálogo vacío para que el cliente cargue el suyo. `true` = trae los productos de demostración |
| `NEXT_PUBLIC_INSTAGRAM_URL` / `…WHATSAPP_NUMBER` | Redes del pie de página (cambiarlas exige reconstruir: paso 4) |

## 4. Levantar

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps          # todo debe decir «healthy» / «running»
docker compose -f docker-compose.prod.yml logs -f api  # Ctrl+C para salir
```

La primera construcción tarda unos minutos. Al terminar abre `https://<tu-sitio>`: Caddy pide solo el certificado
(si es la primera vez puede tardar ~30 segundos).

Entra al panel en `https://<tu-sitio>/admin` con el correo y la contraseña del paso 3.

## 5. Actualizar cuando haya cambios

```bash
cd ~/starboy && git pull
docker compose -f docker-compose.prod.yml up -d --build
```

La base y las fotos **no se tocan** (viven en volúmenes de Docker). El esquema se actualiza solo al arrancar la API.

## 6. Respaldos (hazlo desde el primer día)

```bash
bash infra/scripts/backup.sh        # guarda base de datos + fotos en ./backups y borra los de más de 14 días
```

Programarlo cada noche (`crontab -e`):

```
0 3 * * *  cd /home/ubuntu/starboy && bash infra/scripts/backup.sh >> backups/backup.log 2>&1
```

Y **copia la carpeta `backups/` fuera de la VM** de vez en cuando (a tu computador o a un bucket de Oracle).
Restaurar (reemplaza todo lo actual):

```bash
CONFIRM=yes bash infra/scripts/restore.sh backups/db-AAAAMMDD-HHMMSS.sql.gz backups/uploads-AAAAMMDD-HHMMSS.tgz
```

## 7. Cosas que conviene saber

- **Contraseña del administrador:** hoy no hay pantalla para cambiarla (está en la hoja de ruta). El administrador de `SEED_ADMIN_EMAIL`
  se crea solo la primera vez; cambiar la variable después no lo modifica.
- **Correos:** el sitio todavía no envía correos (recuperar contraseña, confirmaciones). Está en la hoja de ruta.
- **Fotos:** se guardan en el volumen `uploads` del servidor (por eso el respaldo las incluye). Más adelante pueden pasar a Cloudinary.
- **Pasar a producción:** cuando exista la pasarela de pago real, cambia `APP_ENV=production`, `PAYMENT_PROVIDERS=MERCADOPAGO` (u otra),
  `PUBLIC_API_URL` y `NEXT_PUBLIC_PAYMENT_HOSTS` (ver `apps/api/internal/platform/payments/README.md`) y vuelve a construir.
  En producción la pasarela de pruebas **no arranca**.
- **Ver qué pasa:** `docker compose -f docker-compose.prod.yml logs -f` (todos) o `... logs -f api`.
- **Reiniciar:** `docker compose -f docker-compose.prod.yml restart`. **Apagar:** `... down` (los datos se conservan; `down -v` sí los borra).

## 8. Si algo falla

| Síntoma | Causa probable |
|---------|----------------|
| El navegador no abre el sitio | Falta la regla de la *Security List* o el `iptables` (paso 1 y 2) |
| Aviso de certificado / «no seguro» | El dominio aún no apunta a la IP, o Caddy no pudo pedir el certificado (`logs caddy`). Prueba con `sslip.io` |
| `api` se reinicia sin parar | Revisa `logs api`: casi siempre es un valor mal puesto en `.env` (secretos de menos de 32 caracteres, `SANDBOX` en production) |
| La construcción se queda sin memoria (`Killed`) | VM con poca RAM: usa ≥ 4 GB o crea swap (`sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`) |
| «Demasiados intentos» al iniciar sesión | El límite es de 10 por minuto por IP; espera un minuto |
