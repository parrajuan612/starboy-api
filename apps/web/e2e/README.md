# Pruebas de navegador (E2E)

Guiones de Playwright (`playwright-core` + Chrome instalado) que recorren la app real: tienda, carrito, checkout, cuenta,
Encargos USA y panel. Cada uno imprime `✔`/`✘` y termina con `N OK, M fallos`. **No corren en CI** (necesitan el stack local
con Docker y Chrome); se corren a mano antes de cerrar una tarea de interfaz.

| Guion | Qué cubre |
|-------|-----------|
| `catalog` | catálogo, filtros, categorías, ficha de producto |
| `cart` | carrito, envío gratis, persistencia entre pestañas |
| `checkout` | checkout, pago sandbox, idempotencia, errores de la API (**requiere `RESTART_API_CMD`**) |
| `checkout-prefill` | precarga de la dirección predeterminada |
| `account-admin` | cuenta (perfil, direcciones, pedidos) y panel de órdenes, inventario y encargos |
| `imports` | Encargos USA del cliente: calculadora, solicitud, cotización, anticipo, seguimiento |
| `balance` | pago del saldo de un encargo, bloqueo de despacho sin saldo, confirmación manual y contra entrega, re-cotización, página `/pago/retorno` y bandeja `/admin/pagos` (se espacia sola: la API limita los cobros a 10/min) |
| `admin-catalog` | panel de catálogo: productos, tallas, fotos, marcas, categorías, parámetros y tarifas (**requiere `UPLOAD_DIR`**) |

## Cómo correrlas

1. Levanta el stack (ver SSD §16.1): Postgres con Docker, la API en `:8082` y la web **compilada** (`npm run build && npx next start -p 3465`).
   Para `admin-catalog` arranca la API con una carpeta de fotos de prueba, p. ej. `UPLOAD_DIR=/tmp/starboy-uploads`.
2. Desde `apps/web`:

```bash
npm run e2e                      # todos (checkout solo si hay RESTART_API_CMD)
npm run e2e -- imports           # uno
UPLOAD_DIR=/tmp/starboy-uploads npm run e2e -- admin-catalog
```

Variables (todas opcionales): `WEB_URL` (`http://localhost:3465`), `API_ROOT` (`http://localhost:8082`), `CHROME_PATH`
(`/usr/bin/google-chrome`), `DB_CONTAINER` (`starboy_postgres`), `UPLOAD_DIR`, `E2E_OUT` (capturas; por defecto la carpeta temporal),
`RESTART_API_CMD` (comando que reinicia la API; el job que vence reservas corre al arrancar).

## Cuidado con los datos

- Las pruebas **crean usuarios, pedidos, encargos, productos y fotos** reales en la base a la que apuntan. Usa una base de desarrollo.
- `login` y `register` limitan a 10 por minuto por IP: los guiones se espacian solos y pueden tardar unos minutos.
- `admin-catalog` cambia el dólar y una tarifa y los **restaura** al terminar (también si falla).
- `cleanup.sh` deja la base como el seed: borra pedidos, pagos, encargos, direcciones, usuarios que no sean ADMIN y productos, marcas y
  categorías con «Prueba» en el nombre. **Borra datos**: exige `CONFIRM=yes bash e2e/cleanup.sh` y nunca debe apuntar a producción.
