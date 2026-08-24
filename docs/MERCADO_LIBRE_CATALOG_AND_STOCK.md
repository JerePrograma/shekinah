# Mercado Libre: catálogo, stock y Checkout Pro directo

Estado del diseño: implementado en código el 2026-08-24, con activación externa pendiente de OAuth, credenciales rotadas, sincronización real y pruebas controladas.

Este documento es normativo para la integración nueva. Los registros de `docs/validation/` permanecen históricos y no deben reinterpretarse como el estado operativo vigente.

## Autoridades y cierre seguro

Cuando `MERCADO_LIBRE_CATALOG_ENABLED=true`, la autoridad queda separada así:

- Mercado Libre: seller, publicación, variación, SKU, precio, moneda, estado, stock e identidad de inventario;
- D1: espejo runtime, estados de sincronización, tokens OAuth cifrados, órdenes, reservas, ledger idempotente, compensaciones y auditoría;
- Mercado Pago: preferencia, Checkout Pro y estado financiero autoritativo;
- catálogo versionado: estructura editorial y fallback reproducible, nunca validación final de stock o precio.

La integración falla cerrada. Una unidad sólo puede venderse por Shekinah si:

- pertenece al seller esperado;
- tiene un SKU exacto y único en ambos catálogos;
- se mapea a exactamente un producto local;
- la publicación está activa, en ARS, con precio positivo y stock positivo;
- su lectura de User Products informa exclusivamente `seller_warehouse` y un `x-version` utilizable para control optimista;
- la última sincronización válida no supera `MERCADO_LIBRE_CATALOG_MAX_AGE_SECONDS`, cuyo default es 900 segundos.

Las coincidencias por título están prohibidas. Las modalidades `legacy_available_quantity`, `selling_address`, `meli_facility` y `unknown` se reflejan para diagnóstico, pero quedan fuera de Checkout y WhatsApp porque no ofrecen la garantía intercanal implementada.

## Identidad y sincronización

La identidad interna de una unidad se deriva criptográficamente de seller, item, variación y User Product. D1 conserva los identificadores originales en `mercadolibre_catalog_units`; el hash no sustituye esos campos ni oculta ambigüedades. Dos publicaciones o variaciones que comparten el mismo `user_product_id` representan una sola autoridad física: ambas quedan `duplicate`, sin mapeo y no vendibles aunque sus SKU sean distintos. Los IDs del proveedor no salen en la API pública.

La sincronización completa:

1. obtiene la cuenta autorizada mediante OAuth Authorization Code;
2. verifica `/users/me` contra el usuario del token y `MERCADO_LIBRE_EXPECTED_SELLER_ID`;
3. pagina el inventario privado mediante scan, con 100 IDs por página y límite operativo explícito;
4. obtiene detalles en lotes de 20 y vuelve a verificar el seller de cada publicación;
5. normaliza cada variación como unidad independiente;
6. consulta User Products en concurrencia acotada;
7. mapea sólo por SKU exacto;
8. hace upsert idempotente y desactiva ausentes sin borrar historial;
9. registra el ciclo y sus conteos.

Las consultas GET al proveedor tienen timeout, hasta tres intentos y backoff acotado para red, `429` y errores `5xx`. Las mutaciones PUT se intentan una sola vez: ante respuesta incierta se bloquea la unidad y se exige conciliación.

Una unidad inválida no detiene necesariamente el resto del ciclo. Se persiste con error y no vendible; el ciclo queda `partial`. Sólo una falla global —OAuth, conexión, paginación o contrato estructural de la cuenta— falla el ciclo completo.

Las notificaciones de `items` y `orders_v2` se aceptan sólo para la aplicación y seller configurados, se deduplican y se usan como disparador. El cuerpo no es autoridad: la Function vuelve a consultar el item o la orden. Un evento fallido puede reintentarse; un evento duplicado procesado no vuelve a aplicar efectos.

La reconciliación periódica usa un solo scheduler: `.github/workflows/mercadolibre-reconcile.yml`. GitHub Actions lo ejecuta cada cinco minutos sobre el último commit de `main`, fuera del minuto cero, y llama por `POST` a `/api/internal/mercadolibre/reconcile`. El secreto server-to-server `MERCADO_LIBRE_SCHEDULER_SECRET` viaja únicamente en `Authorization`, pertenece al environment `cloudflare-pages-production`, restringido a la rama `main`, y debe coincidir con el secreto cifrado de Pages. No se incluye en URL, Git, bundle ni logs.

El endpoint tiene timeout externo de ocho minutos, un reintento acotado y el lock único D1 ya usado por la sincronización manual. Una ejecución solapada no inicia otro ciclo. El workflow no despliega, no ejecuta llamadas durante build y sólo imprime estado y contadores resumidos; falla visiblemente si el ciclo queda `partial`/`failed` o si una liberación vence sin compensarse. `900` segundos dejan diez minutos de margen sobre el intervalo nominal para cola, jitter y ejecución; si GitHub retrasa o descarta ciclos hasta superar ese límite, el catálogo falla cerrado. Checkout y WhatsApp revalidan selectivamente aun dentro de la ventana.

**Sincronizar ahora** permanece como operación administrativa de diagnóstico y recuperación, no como única fuente de frescura. Las notificaciones oficiales siguen aportando actualización incremental y la reconciliación completa cura eventos perdidos, duplicados, fuera de orden o fallidos mediante una relectura autoritativa.

## OAuth y tokens

El endpoint administrativo crea un `state` aleatorio de un solo uso y diez minutos. El callback intercambia el código server-side y nunca entrega tokens al navegador.

El access token y refresh token rotativo se almacenan cifrados con AES-GCM en D1. `MERCADO_LIBRE_TOKEN_ENCRYPTION_KEY` permanece únicamente como secreto cifrado de Pages. La renovación usa un lock persistido en D1; sólo el propietario del lock puede reemplazar ambos tokens. Un refresh token anterior no se reutiliza después de una rotación exitosa.

Variables backend no secretas:

```text
MERCADO_LIBRE_CATALOG_ENABLED
MERCADO_LIBRE_CATALOG_MAX_AGE_SECONDS
MERCADO_LIBRE_CLIENT_ID
MERCADO_LIBRE_APPLICATION_ID
MERCADO_LIBRE_EXPECTED_SELLER_ID
```

Secretos backend:

```text
MERCADO_LIBRE_CLIENT_SECRET
MERCADO_LIBRE_TOKEN_ENCRYPTION_KEY
MERCADO_LIBRE_SCHEDULER_SECRET
```

Ninguna variable de Mercado Libre usa el prefijo `VITE_`.

## Reserva intercanal

Checkout Pro y WhatsApp llaman a `reserveMercadoLibreInventory`. La secuencia por unidad es:

1. validar la versión de catálogo que vio el comprador;
2. volver a consultar el snapshot de stock y su `x-version`;
3. persistir una operación `reserve` con clave idempotente por orden e inventario;
4. reducir la cantidad upstream mediante PUT con `x-version`;
5. volver a leer y confirmar el total esperado;
6. actualizar el espejo y marcar la operación `confirmed`.

El descuento upstream ocurre antes de crear la preferencia o abrir WhatsApp. La aprobación no vuelve a descontar: agrega un marcador `consume` idempotente. El rechazo, cancelación o vencimiento libera exactamente el delta reservado sobre el snapshot actual y también usa `x-version`; nunca restaura ciegamente un snapshot viejo.

Una respuesta perdida, versión conflictiva o resultado no demostrable queda `uncertain` o `compensation_pending`. La unidad no se vuelve a mutar a ciegas. El backoffice expone esas operaciones para conciliación. El catálogo público conserva el producto y el carrito, oculta la cantidad obsoleta y muestra **Actualizando disponibilidad** hasta recuperar una lectura válida.

Un reembolso no repone stock automáticamente. Se agrega una operación de revisión con `REFUND_REQUIRES_MANUAL_STOCK_POLICY` porque la decisión comercial de reponer no puede inferirse.

Las reservas Mercado Libre no usan `order_items.stock_controlled`: ese indicador pertenece al inventario local legado y sus triggers. La reserva upstream y su ledger son la exclusión autoritativa para unidades Mercado Libre; mantener ambos contadores sobre la misma unidad produciría una doble reserva.

## Carrito y Checkout Pro

El cliente envía únicamente:

- ID local de producto;
- cantidad;
- versión opaca del catálogo vista por el comprador;
- fulfillment e idempotencia ya definidos por el contrato.

No envía precio, moneda, total ni URL de retorno autoritativos. La Pages Function sincroniza selectivamente los items, recalcula precio, envío y total, crea la orden, reserva stock upstream y crea la preferencia. Sólo devuelve el token público de orden y una URL de Checkout Pro validada contra hosts admitidos.

El carrito muestra **Pagar con Mercado Pago**, cambia a **Preparando pago…**, bloquea doble clic y redirige con `window.location.assign`. El Link de Pago fijo, la copia del total y las instrucciones para ingresar un monto fueron retirados del flujo público. Los eventos históricos `manual_payment_click` permanecen en D1 y en métricas sólo como interacciones históricas.

Ante precio cambiado, el backend responde `CATALOG_VERSION_CONFLICT`; el cliente actualiza el catálogo, muestra el precio vigente y exige volver a presionar el botón. Ante stock reducido, la línea y la cantidad solicitada se conservan, se informa el disponible y el usuario debe ajustar o eliminar conscientemente. Un error nunca limpia el carrito.

## Mercado Pago

La orden existe antes de la preferencia. Mercado Pago recibe el carrito calculado por servidor y `external_reference`/metadata de la orden. El retorno del navegador sólo consulta estado.

El webhook conserva:

- firma obligatoria;
- consulta autoritativa del pago;
- validación de `live_mode`, collector, metadata, referencia, moneda e importe;
- idempotencia y estados monotónicos;
- consumo o liberación del ledger Mercado Libre exactamente una vez.

El rollback del botón no deshabilita webhooks ni conciliación de operaciones ya iniciadas.

## Backoffice

La sección **Mercado Libre** requiere la sesión administrativa existente y muestra:

- conexión y seller;
- último ciclo, fecha, procesados y error;
- unidades, vendibles, elegibles para Checkout, pausadas, cerradas, agotadas, ausentes, sin mapeo, ambiguas, duplicadas, User Products compartidos, modelos de stock, obsoletas, negativas y con error;
- reservas activas y vencidas;
- operaciones pendientes o inciertas;
- pagos aprobados con conflicto;
- reembolsos para revisión.

**Autorizar cuenta vendedora** inicia OAuth. **Sincronizar ahora** es autenticada, same-origin, auditada por el wrapper administrativo e idempotente frente a doble ejecución mediante un lock único D1. El cron comparte ese lock y usa una credencial distinta de la sesión administrativa.

## Migración 0009

`migrations/0009_mercadolibre_catalog_and_inventory.sql` es aditiva. Crea:

- `mercadolibre_oauth_states`;
- `mercadolibre_connections`;
- `mercadolibre_sync_runs`;
- `mercadolibre_catalog_units`;
- `mercadolibre_inventory_operations`;
- `mercadolibre_notifications`;
- columnas de trazabilidad de proveedor en `order_items`;
- índices de identidad, atención y exclusión de sincronización.

No elimina productos, órdenes, pagos ni mutaciones históricas; no cambia stock comercial durante la migración.

## Secuencia de activación

Mantener estos flags en `false` hasta completar toda la lista:

```text
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
```

Orden obligatorio:

1. rotar las credenciales expuestas de Mercado Pago por entorno;
2. aplicar `0009` en preview;
3. configurar la aplicación Mercado Libre, secretos y seller esperado de preview;
4. completar OAuth y verificar seller;
5. sincronizar y auditar mapeos/modelos sin ambigüedades vendibles;
6. probar reservas, compensaciones, Webhook sandbox y Checkout Pro sandbox;
7. aplicar `0009` y secretos aislados en producción;
8. repetir OAuth y sincronización de sólo lectura;
9. confirmar cero negativos, duplicados vendibles y operaciones inciertas;
10. cargar el mismo secreto aleatorio en Pages producción y en el environment GitHub `cloudflare-pages-production`;
11. desplegar el mismo SHA aprobado por CI y verificar manualmente el workflow de reconciliación con Checkout cerrado;
12. habilitar backend y frontend sólo al final;
13. pedir confirmación puntual antes de cualquier pago monetario real.

## Rollback

Para bloquear ventas nuevas sin perder pagos en curso:

1. establecer `VITE_COMMERCE_ENABLED=false` y reconstruir para ocultar el botón;
2. establecer `COMMERCE_ENABLED=false` para rechazar nuevas preferencias;
3. mantener `MERCADO_LIBRE_CATALOG_ENABLED=true` mientras existan reservas u operaciones pendientes;
4. mantener activos los webhooks de Mercado Pago y Mercado Libre;
5. ejecutar conciliación administrativa y liberar o consumir cada reserva según su estado autoritativo;
6. no borrar conexiones OAuth, notificaciones, órdenes ni ledger;
7. restaurar operación sólo después de cero operaciones `uncertain` o `compensation_pending`.

Si Mercado Libre queda indisponible o el catálogo supera el umbral de frescura, se bloquean Checkout y WhatsApp para las unidades afectadas; el carrito se conserva.
