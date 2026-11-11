# Pasarelas de pago

El resto del sistema (órdenes, encargos, panel, web) **no sabe qué pasarela hay detrás**. Todo pasa por la interfaz
`Provider` (`provider.go`). Para conectar Mercado Pago (o Wompi, ePayco…) solo se escribe un adaptador y se registra:

## 1. Qué ya está resuelto (no hay que tocarlo)

- **Montos:** los fija siempre el servidor (orden, anticipo o saldo); el cliente nunca los envía.
- **Idempotencia y atomicidad:** `payment.Service.ProcessEvent` aplica un webhook de forma atómica y repetible
  (pago + estado + stock + historial juntos). Un evento repetido responde 200 sin cambiar nada.
- **Pagos que no encajan** (orden ya vencida, encargo en otro estado, monto distinto) quedan **IN_REVIEW**
  (revisión manual en `/admin/pagos`); el dinero nunca se pierde ni se inventa un estado.
- **Anticipo y saldo** de encargos, y pago de órdenes de la tienda.
- **Web:** `/pago/retorno?pid=…` recibe al cliente que vuelve de la pasarela y espera la confirmación del webhook;
  una URL de pago externa se abre solo si su host está en `NEXT_PUBLIC_PAYMENT_HOSTS`.

## 2. Lo que escribe el adaptador

```go
type Provider interface {
    Name() models.PaymentProvider                                        // MERCADOPAGO ya existe en la restricción de la BD
    CreateCheckout(ctx, CheckoutInput) (CheckoutResult, error)           // crea la preferencia/cobro en la pasarela
    CheckoutURL(providerRef string) string                               // debe poder reconstruirse SOLO con la referencia
    ParseWebhook(h http.Header, body []byte, now time.Time) (*Event, error) // verifica la firma y traduce el mensaje
}
```

- `CheckoutInput` trae el monto, la descripción, `Reference` (SB-… / IMP-…), `ReturnURL` (a dónde devolver al cliente) y
  `NotifyURL` (webhook público; vacío si falta `PUBLIC_API_URL`).
- `ProviderRef` es el id del cobro en la pasarela (único, ≤ 120 caracteres) y es lo que viene en el webhook.
- `ParseWebhook` **debe verificar la autenticidad** (firma/HMAC y, si la pasarela lo ofrece, marca de tiempo) y devolver
  `ErrInvalidSignature` si falla. Si el webhook solo trae un id y hay que consultar el estado a la API de la pasarela,
  se hace aquí (nunca se confía en el cuerpo sin verificar).
- Si la pasarela aprueba/rechaza con más estados (pendiente, en proceso…), traduce solo `approved` y `declined`;
  ignora el resto devolviendo `ErrInvalidPayload` (el handler responde 400 y la pasarela reintenta después).

## 3. Pasos para conectar una pasarela

1. Crear `internal/platform/payments/mercadopago.go` con el adaptador.
2. Registrarlo en `registry.go` (`case models.ProviderMercadoPago:`), leyendo sus credenciales de variables de entorno
   (agrégalas a `config.Payments` y a `.env.example`; **nunca** al repo).
3. **Pasar la suite de contrato**: copiar `contract_test.go` y adaptar `Harness` (`providertest.Run`). Si pasa, el
   adaptador cumple lo que el sistema da por hecho.
4. Habilitar: `PAYMENT_PROVIDERS=MERCADOPAGO` (en producción `SANDBOX` está prohibido y no se arranca con él),
   `PUBLIC_API_URL=https://api.tu-dominio.com` y `WEB_BASE_URL=https://tu-dominio.com`.
5. En la web (`apps/web/.env.local`): `NEXT_PUBLIC_PAYMENT_HOSTS=www.mercadopago.com.co` (hosts a los que se permite redirigir).
6. Registrar en el panel de la pasarela la URL de notificación: `https://api.tu-dominio.com/api/v1/payments/webhook/mercadopago`.
7. Probar en el modo de pruebas de la pasarela: pago aprobado, rechazado, webhook repetido, webhook con firma mala.
8. Lista de verificación de salida a producción: `GET /api/v1/payments/providers` solo lista las pasarelas reales,
   el simulador (`POST /payments/:id/simulate`) no existe, y `/admin/pagos` no tiene pagos IN_REVIEW sin atender.

## 4. Lo que NO cubre todavía

- Reembolsos (`REFUNDED` existe como estado, pero no hay flujo).
- Transferencia bancaria con comprobante y contra entrega (`BANK_TRANSFER`, `CASH_ON_DELIVERY`): usan este mismo modelo, pero
  su aprobación es manual desde el panel.
