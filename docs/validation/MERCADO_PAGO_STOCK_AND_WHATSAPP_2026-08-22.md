# Cierre funcional de Mercado Pago, stock y WhatsApp — 2026-08-22

## Alcance

Se trabajó directamente sobre `main` y `origin/main`, desde la base limpia y sincronizada:

```text
77f61cf48fae91a4296e4e8ce66a4ac41c5d6392
```

Objetivos:

- vincular el stock controlado al ciclo real de Checkout Pro;
- preservar el fallback manual y las reservas WhatsApp;
- exigir datos mínimos completos antes de crear un pedido WhatsApp;
- validar D1, código, CI, Pages y smoke sin activar todavía Checkout Pro productivo.

No se creó rama, PR, worktree o stash. No se usó rebase, reset destructivo ni force-push.

## Resultado funcional

`migrations/0008_checkout_pro_stock_and_whatsapp_identity.sql` agrega:

- `orders.stock_reserved_at`;
- `orders.stock_reservation_expires_at`;
- `orders.stock_consumed_at`;
- `orders.whatsapp_fulfillment_fingerprint`;
- `order_items.stock_controlled`;
- índice de reservas Checkout Pro;
- triggers que comparten disponibilidad entre ambos canales y protegen snapshots, catálogo y consumo.

Semántica resultante:

- Checkout Pro reserva stock antes de solicitar la preferencia y durante la misma ventana de 30 minutos;
- un pago `pending` consultado autoritativamente conserva la reserva después de ese vencimiento;
- `approved` o `refunded` consume stock físico una sola vez;
- un reembolso financiero no repone mercadería automáticamente;
- una aprobación tardía sin stock disponible falla cerrada con conciliación requerida;
- una repetición con la misma UUID excluye sólo su propia reserva para recuperar el mismo intento;
- WhatsApp conserva `pending → approved|rejected`, compartiendo el mismo disponible con Checkout Pro;
- nombre, celular, dirección, localidad, provincia y código postal son obligatorios para WhatsApp en cliente y servidor;
- una tarifa determinística persiste fulfillment; una cotización manual guarda sólo su huella SHA-256 y no PII en claro;
- `localStorage` conserva únicamente UUID, digest y tiempo, nunca datos de entrega.

Mercado Pago recibe items y cantidades en una preferencia, pero Checkout Pro no es una base de inventario. La integración directa implementada es `preferencia/pago del proveedor → reserva/consumo D1`; D1 continúa siendo la autoridad transaccional de stock.

## Validación local

Preparación reproducible:

| Comando | Estado | Resultado |
|---|---|---|
| `npm ci` | VERIFICADO | 201 paquetes instalados desde el lockfile. |
| `npm run install:browsers` | VERIFICADO | Chromium disponible para Playwright. |
| `npm run lint` | VERIFICADO | ESLint completo y catálogo generado con 510 productos. |
| `npm run typecheck` | VERIFICADO | TypeScript estricto sin errores. |

Fallos preservados:

1. La primera ejecución de `npm run verify` terminó con 45/46 archivos y 250/251 pruebas Vitest. `server/fulfillment.test.ts` construía sólo el esquema `0001`–`0003` y `prepareOrder` encontró `table orders has no column named stock_reserved_at`. Se corrigió el fixture para aplicar `0001`–`0008`; el test focal pasó 2/2.
2. La siguiente ejecución completó 46/46 archivos y 251/251 Vitest, pero Playwright terminó 21/24. Tres escenarios antiguos intentaban WhatsApp sin completar el nuevo contrato obligatorio y recibían la validación esperada. Se agregó un helper con fulfillment válido; `tests/e2e/commerce.spec.ts` pasó 11/11.
3. La ejecución final de `npm run verify` terminó VERIFICADA: 46/46 archivos, 251/251 Vitest, catálogo 510/16, assets, seguridad, automatización, build y 24/24 Playwright.
4. `npm run build:pages` terminó VERIFICADO con 251/251 Vitest, build y todos los verificadores. Persistió sólo el warning histórico no bloqueante por un chunk mayor a 500 kB.
5. `git diff --check` y `git diff --cached --check` terminaron sin errores. `verify:security` confirmó ausencia de credenciales y source maps en el artefacto.

## D1 preview

Preflight:

- destino: `shekinah-commerce-preview` mediante binding `DB --preview`;
- `0008` pendiente;
- bookmark previo de Time Travel: `0000002d-00000000-000050cf-9e2adbd1bd369eda9701d2b513b05002`;
- 13 pedidos, 13 items, cero productos con stock controlado y cero reservas Checkout Pro activas.

Intentos y cierre:

1. `wrangler d1 migrations apply DB --remote --preview` falló con `7500 incomplete input` al enviar triggers mediante `/query`.
2. Se verificó rollback total: cero columnas nuevas, cero triggers Checkout, `0008` ausente de `d1_migrations` y cero violaciones FK.
3. El mismo flujo de migraciones `0001`–`0008` pasó localmente con Wrangler.
4. La aplicación definitiva usó `wrangler d1 execute DB --remote --preview --file ... --yes`, import oficial de D1, con el SQL versionado y la inserción exacta de su nombre en `d1_migrations`. Procesó 23 consultas y terminó `success`.
5. La verificación remota encontró `0008=1`, cuatro columnas de pedido, una columna de item, once triggers esperados, 13 pedidos, 13 items y cero violaciones FK.
6. Smoke reversible: un producto técnico con stock físico 1 aceptó la primera reserva Checkout Pro; la segunda fue rechazada por D1 con `STOCK_RESERVATION_INSUFFICIENT`.
7. Se eliminaron los dos pedidos y el producto técnicos. El cierre confirmó cero filas sintéticas, 13 pedidos, 13 items y cero violaciones FK.

La variante incorrecta `d1 time-travel info ... --remote --preview` también fue rechazada porque ese subcomando actúa siempre sobre remoto y no acepta esos flags; los bookmarks correctos se obtuvieron por nombre de base. No tuvo efecto sobre datos.

## D1 producción

Preflight inmediatamente anterior:

- destino: `shekinah-commerce` mediante binding `DB` sin `--preview`;
- bookmark previo de Time Travel: `0000029e-00000000-000050cf-e0a55e42e10398489cc7ac5009499177`;
- `0008=0`, cuatro columnas nuevas ausentes y cero violaciones FK;
- 15 pedidos, 30 items y 6 productos con stock controlado;
- cero WhatsApp pendientes;
- cuatro pedidos Checkout Pro pendientes históricos, cero pagos pendientes y cero items Checkout Pro asociados a los seis productos controlados.

Después de cerrar preview se usó el mismo import oficial. Procesó 23 consultas y terminó `success`. La verificación final encontró:

```text
0008 registrada: 1
columnas nuevas de orders: 4
columna nueva de order_items: 1
triggers esperados: 11
pedidos: 15
items: 30
productos controlados: 6
reservas Checkout Pro activas: 0
violaciones FK: 0
migraciones pendientes: 0
```

No se creó un pedido positivo ni se modificó stock comercial en producción.

## Git, CI y Pages

Commit funcional:

```text
58ff324133cf665baacf946f54e960cd3d519398
feat: unify Mercado Pago and WhatsApp stock
```

Publicación y evidencia:

- push normal `77f61cf..58ff324` a `origin/main`;
- workflow `CI` `32584798635`: `success`;
- job `Verify` `97059454902`: `success` en 2m17s;
- artefacto `shekinah-dist-58ff324133cf665baacf946f54e960cd3d519398`, ID `9478776794`, no expirado;
- check `Cloudflare Pages`: `success` para el mismo SHA;
- deployment de producción `6483757c-5d46-4559-a6b4-d22caab70d16`, URL inmutable `https://6483757c.shekinah-7dl.pages.dev`, activo;
- `https://shekinah.ar/`: HTTP 200 y CSP first-party;
- `POST /api/checkout/preferences`: 503 `COMMERCE_DISABLED`;
- pedido WhatsApp con producto técnico inexistente: 400 `PRODUCT_NOT_FOUND`;
- D1 posterior: cero pedidos para ambas claves de smoke.

## Estado real de Mercado Pago

Verificado mediante la sesión autenticada, sin guardar ni repetir valores secretos:

- aplicación: `Shekinah Moreno Checkout`, producto Checkout Pro;
- Webhook de prueba: `https://mp-sandbox.shekinah-7dl.pages.dev/api/webhooks/mercadopago`;
- Webhook productivo: `https://shekinah.ar/api/webhooks/mercadopago`;
- el Access Token y Client Secret expuestos fueron renovados mediante dos reautenticaciones del proveedor; la clave anterior quedó programada para su vencimiento más próximo;
- el nuevo Access Token se transfirió directamente al secreto cifrado de Pages production y luego se descartó de la sesión de automatización; el token sandbox de preview no fue reemplazado;
- prueba y producción quedaron seleccionadas únicamente para `Pagos`, el tópico que acepta el endpoint;
- la clave secreta de firma vigente coincidió en ambos modos y se reemplazó directamente como secreto cifrado de Pages production y preview, sin imprimirla ni llevarla al repositorio o terminal;
- calidad de integración: `0/100`, sin medición productiva válida;
- no existe evidencia de un pago productivo aprobado para el SHA funcional;
- producción Pages conserva `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` y `ORDER_TOKEN_SECRET` como valores cifrados; preview conserva su token sandbox y recibió sólo la clave de firma vigente.

## Estado de activación y pendientes

Estado: PARCIAL CONTROLADO.

Código, D1, CI, Pages y smoke no destructivo están verificados. Checkout Pro público permanece cerrado:

```text
production COMMERCE_ENABLED=false
production VITE_COMMERCE_ENABLED=false
preview COMMERCE_ENABLED=true
preview VITE_COMMERCE_ENABLED=false
```

Falta, con confirmación inmediata antes de cada transacción:

1. ejecutar un pago sandbox controlado;
2. ejecutar un pago productivo con comprador distinto de la cuenta vendedora;
3. verificar firma, consulta al proveedor, referencia, importe, ARS, estado D1, reserva y consumo físico;
4. revisar la calidad de integración y recién entonces autorizar el cambio de flags públicos.

Un push, una preferencia pendiente o un retorno del navegador no prueban pago, activación ni calidad. No hubo force-push.

## Continuación del 2026-08-23

Esta sección conserva sin reescribir la evidencia anterior y registra la auditoría posterior:

- `main` y `origin/main` partieron limpios y sincronizados en `9bc6625`;
- la línea base local aprobó 47 archivos y 258 pruebas Vitest, build, verificadores y 25 pruebas Playwright;
- production y preview continúan con `0001` a `0008` sin migraciones pendientes;
- Wrangler 4.125.0 confirmó los ocho nombres de secretos requeridos como cifrados en cada entorno, sin leer valores;
- la configuración remota conserva production en modo `production` con ambos flags de comercio en `false`, y preview en `sandbox` con backend `true` y frontend `false`;
- el deployment base productivo `bc18e32f-2d8d-4008-b185-5e6ac3c7e874` y el preview `0914fd9f-c763-45e1-bdac-f6287ad5f97c` publican `9bc6625`;
- el smoke base comprobó `shekinah.ar` 200, `www` 301 al apex, CSP/HSTS, URL inmutable 200, webhook GET 405 con `Allow: POST` y preferencias 503 `COMMERCE_DISABLED`;
- D1 producción conserva 15 pedidos, cero pagos/eventos, cero reservas WhatsApp pendientes y cero stock negativo; preview conserva su evidencia sandbox aislada;
- el catálogo productivo efectivo tiene 513 productos, 512 vendibles, 6 con stock numérico, 507 sin control numérico, 1 agotado, 0 inválidos/negativos y 0 deshabilitados;
- se agregó consentimiento WhatsApp obligatorio en frontend/backend, domicilio condicional para Correo, minimización del domicilio en retiro, número visible `SHK-…` y vencimiento idempotente de reservas manuales a 24 horas;
- las pruebas dirigidas posteriores aprobaron 7 archivos y 47 casos, incluidos consentimiento, concurrencia, vencimiento, liberación y bloqueo de aprobación tardía;
- la verificación final aprobó 47 archivos y 261 casos Vitest, los verificadores estáticos, el build y 25 casos Playwright; `build:pages` aprobó por separado con los mismos 261 casos;
- los intentos dentro del sandbox que requieren procesos hijos fallaron por `spawn EPERM`; las mismas verificaciones ejecutadas fuera de esa restricción aprobaron;
- una primera ejecución completa detectó que la prueba de vencimiento esperaba una escritura durante una lectura pública; se preservó el GET sin mutaciones y se validó la materialización al resolver administrativamente;
- una segunda ejecución completa detectó tres expectativas E2E todavía ligadas al ID técnico; se actualizaron al número legible y Playwright aprobó 25/25;
- la reautenticación del titular se completó mediante QR sin compartir códigos;
- el panel confirmó el 2026-08-23 las URLs Webhook de prueba y producción, únicamente el evento **Pagos** y una clave de firma configurada en cada entorno;
- la calidad vigente sigue en 0/100 y muestra una fecha inválida de 1900, sin Payment ID productivo verificable;
- el panel no ofrece una fecha útil de rotación y el DOM expuso una credencial sandbox durante la inspección. Se la considera comprometida; no se reutilizará ni se activará Checkout hasta rotar, sincronizar cada entorno y volver a validar.
