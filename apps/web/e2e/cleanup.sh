#!/bin/bash
# SOLO PARA BASES DE DESARROLLO/PRUEBA. Borra todos los pedidos, pagos, encargos, direcciones y usuarios que no sean ADMIN,
# y los productos/marcas/categorías cuyo nombre contenga «Prueba». Hay que confirmarlo: CONFIRM=yes bash e2e/cleanup.sh
[ "$CONFIRM" = "yes" ] || { echo "Esto borra datos. Repite con CONFIRM=yes si es una base de prueba."; exit 1; }
DB="${DB_CONTAINER:-starboy_postgres}"
# Borra órdenes/pagos/usuarios de prueba y deja el stock demo como estaba (la bitácora es inmutable: se desactiva el trigger solo aquí).
docker exec -i "$DB" psql -U starboy -d starboy_db -q <<'SQL'
BEGIN;
ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutable;
DELETE FROM inventory_movements WHERE order_id IS NOT NULL;
ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutable;
DELETE FROM payments;
DELETE FROM order_status_history; DELETE FROM order_items; DELETE FROM orders;
-- el stock físico se recalcula desde la bitácora que queda (las altas iniciales de la demo)
UPDATE product_variants v SET stock_reserved = 0, stock_on_hand = COALESCE((SELECT SUM(delta_on_hand) FROM inventory_movements m WHERE m.variant_id = v.id), 0);
ALTER SEQUENCE order_code_seq RESTART WITH 1;
COMMIT;
SQL
# Paso 6: encargos de prueba (las FK a users son RESTRICT)
docker exec -i "$DB" psql -U starboy -d starboy_db -q <<'SQL'
BEGIN;
DELETE FROM import_status_history; DELETE FROM import_quotes; DELETE FROM import_request_items; DELETE FROM import_requests;
DELETE FROM addresses WHERE user_id IN (SELECT id FROM users WHERE role='ADMIN');
UPDATE users SET phone='', document_id='' WHERE role='ADMIN';
DELETE FROM users WHERE role <> 'ADMIN';
COMMIT;
SQL
# Paso 7: productos, marcas y categorías de prueba del panel (la bitácora de sus tallas se borra con el trigger desactivado)
docker exec -i "$DB" psql -U starboy -d starboy_db -q <<'SQL'
BEGIN;
ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutable;
DELETE FROM inventory_movements WHERE variant_id IN (SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.name LIKE '%Prueba%');
ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutable;
DELETE FROM products WHERE name LIKE '%Prueba%';
DELETE FROM categories WHERE name LIKE '%Prueba%' AND parent_id IS NOT NULL;
DELETE FROM categories WHERE name LIKE '%Prueba%';
DELETE FROM brands WHERE name LIKE '%Prueba%';
COMMIT;
SQL
