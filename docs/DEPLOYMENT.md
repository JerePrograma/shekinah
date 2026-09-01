# Despliegue

La activación vigente se rige por `docs/COMMERCE_DEPLOYMENT.md`. Dux es la autoridad de inventario y la integración directa Mercado Libre está retirada; `docs/MERCADO_LIBRE_CATALOG_AND_STOCK.md` es referencia histórica, no un procedimiento de activación.

## Configuración de Cloudflare Pages

Nombre exacto del proyecto Pages: `shekinah`

Dominio público canónico: `shekinah.ar`

Dominio técnico de Pages y origen de preview: `shekinah-7dl.pages.dev`

Alias `www`: Bulk Redirect HTTPS `301` a `https://shekinah.ar`, preserva path/query y termina en 200

Rama de producción: `main`

Comando de build: `npm run build:pages`

Directorio de salida: `dist`

Versión de Node.js: `24.18.0`

Directorio raíz: raíz del repositorio.

Pages Functions: `functions/`.

Configuración de referencia: `wrangler.example.jsonc`.

Existe un Worker independiente también llamado `shekinah`. Verificar siempre que la ruta del panel sea `pages/view/shekinah`; los settings bajo `workers/services/view/shekinah` pertenecen al recurso equivocado.

## Estado externo histórico verificado el 2026-08-22

- build `npm run build:pages`, salida `dist`, rama `main` y deployments automáticos: verificados;
- binding `DB`: `shekinah-commerce` en producción y `shekinah-commerce-preview` en preview;
- migraciones `0001` a `0008`: aplicadas y sin pendientes en ambas D1;
- variables server-side: analítica activa y retención 730 en ambos; backend de comercio cerrado en producción y habilitado sólo para sandbox de preview, con botón público cerrado en ambos;
- secretos administrativos: cuatro nombres cifrados presentes en ambos entornos, valores no inspeccionables;
- secreto analítico: `ANALYTICS_HMAC_SECRET` presente como `secret_text` con valor independiente por entorno;
- Zero Trust y Access: no configurados; el código lo admite sólo como fallback opcional;
- runtime de producción y preview: `Fail closed`;
- Checkout Pro: continúa deshabilitado. El Access Token y Client Secret expuestos fueron renovados, el token productivo se reemplazó cifrado sólo en production, la clave firmada se reconcilió en ambos entornos y Webhooks quedó limitado a `Pagos`; falta validar pagos controlados y calidad antes de activar. La analítica first-party permanece activa bajo consentimiento.
- R2: activo, con bucket existente `shekinah` reutilizado en producción y bucket aislado `shekinah-preview` en preview;
- binding `CATALOG_IMAGES`: configurado en producción y preview; ambos buckets Standard/default, `publicR2DevEnabled=false` y lectura pública exclusivamente first-party mediante Pages;
- upload administrativo: infraestructura y deployment listos; smoke autenticado de imágenes no repetido en esta activación por ausencia de credencial en claro.
- zona DNS `shekinah.ar`: `active`, delegada a `angela.ns.cloudflare.com` y `ed.ns.cloudflare.com`;
- DNSSEC: deshabilitado, sin DS publicado en `.ar`; estado inicial válido y sin cadena rota;
- custom domain del apex, verificación y validación: `active`; CNAME proxied al dominio técnico de Pages;
- apex HTTPS: 200 con certificado confiable emitido por Google;
- `www`: Bulk Redirect HTTPS `301` al apex preservando path/query y destino final 200; el A proxied `192.0.2.1` es el placeholder oficial para entregar tráfico a la regla, no un origen;
- TLS de apex y `www`: pack Universal `active` de Google Trust Services WE1, SAN `shekinah.ar` y `*.shekinah.ar`, TLS 1.3 verificado.

Como `/api/*`, `/admin` y `/admin/*` están incluidos en `public/_routes.json`, ambos entornos deben conservar `Fail closed`. Cloudflare documenta la diferencia en <https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed>.

## Estado productivo vigente verificado el 2026-09-01

- la API Dux v2 respondió correctamente desde el host de operación con el secreto suministrado, sin imprimirlo ni persistirlo; el plan comercial exacto de la cuenta no fue confirmado y no debe inferirse;
- los identificadores obtenidos mediante endpoints oficiales son empresa `12862`, sucursal `1` y depósito `25566`; `GET /v2/items` informó `743` items;
- las migraciones `0010` a `0013` quedaron aplicadas y verificadas tanto en `shekinah-commerce-preview` como en `shekinah-commerce`, con bindings separados y sin violaciones de claves foráneas;
- `0013_remove_local_catalog_stock.sql` saneó seis documentos editoriales productivos y dejó cero payloads activos que contengan `stockQuantity`, `reservedQuantity` o `availableQuantity`; retiró los triggers de reserva/consumo local y exige snapshot Dux exacto en toda línea comercial nueva; los 15 pedidos y 30 items históricos se preservaron;
- las variables Dux y los nombres de secretos server-side requeridos quedaron configurados; sus valores no se registraron ni se incorporaron al repositorio;
- tres reconciliaciones manuales en producción fallaron cerradas con `DUX_UNAVAILABLE`, sin procesar ni mapear items y sin publicar snapshot;
- el candidato diagnóstico `f138820` registró un único evento seguro por la falla terminal: `kind=fetch_exception`, `endpoint=/v2/empresas`, `providerStatus=null`, `attempts=3`; no registró URL completa, query, token, cuerpo del proveedor ni mensaje de excepción;
- el estado D1 posterior conserva tres ciclos fallidos, cero filas de contexto de tenant, cero filas de inventario/snapshot y cero vínculos de pedidos Dux;
- el estado final mantiene `DUX_API_ENABLED=false`, `COMMERCE_ENABLED=false`, `VITE_COMMERCE_ENABLED=false`, ambos flags Mercado Libre en `false` y el scheduler Dux desactivado;
- GitHub Actions CI `#416` concluyó correctamente para `f138820`;
- el deployment productivo canónico `8781412e-629b-4473-8081-89c6fbc1ffec` publicó `f138820` con stage exitoso, `fail_open=false` y los bindings D1/R2 preservados;
- el builder de Pages omite la instalación automática y ejecuta el build con npm `11.6.0`; el build productivo terminó correctamente.

Esta evidencia no habilita Dux ni el comercio: confirma una configuración fail-closed y una incompatibilidad de transporte entre Pages Functions y el endpoint Dux que debe diagnosticarse sin relajar los guards.

### Candidato de corte Dux posterior

Una fase posterior iniciada desde `2bbd62f547b9b0de84f8794a6dcf679ef07a7df8` aisló la incompatibilidad en `redirect: 'error'`. El candidato usa `redirect: 'manual'`, nunca sigue redirecciones, rechaza todo `3xx`, valida el total paginado y emite diagnóstico v2 sanitizado. También agrega bootstrap conservador de identidad y `0014_dux_atomic_inventory_snapshots.sql` para staging incremental/publicación atómica: cada ciclo verifica Dux completo, pero sólo escribe el delta y renueva frescura global al finalizar. Estos cambios están validados localmente, pero el SHA, CI, deployment, aplicación remota de `0014` y primer sync productivo se registran aparte; el estado externo anterior continúa fail-closed y sin snapshot hasta observarlos.

## Configuración pública autorizada el 2026-08-10

```text
PUBLIC_SITE_URL=https://shekinah.ar
VITE_WHATSAPP_NUMBER=5492236216559
```

`VITE_WHATSAPP_NUMBER` es el único dato público de canal incluido como default autorizado. La variable de Link de Pago fue retirada. La API confirmó `PUBLIC_SITE_URL` y `ALLOWED_SITE_ORIGINS` en `https://shekinah.ar` para production y en `https://shekinah-7dl.pages.dev` para preview. `PUBLIC_SITE_URL` debe permanecer explícito antes de habilitar Dux o Checkout Pro; no debe reactivarse OAuth de Mercado Libre.

El apex fue agregado mediante Custom Domains del proyecto Pages, sin usar IPs circunstanciales ni registros A/AAAA inventados. Conservar el CNAME proxied administrado y no reemplazar el placeholder de `www` por una supuesta IP de origen. Apex, `www`, TLS y redirección quedaron verificados por separado.

WhatsApp y Checkout Pro no necesitan VPS: usan Pages Functions y D1. El Link de Pago manual no forma parte del deployment vigente.

## Estados separados

Debe registrarse por separado:

1. SHA publicado en GitHub;
2. GitHub Actions para ese SHA;
3. deployment de Pages;
4. estado público de Checkout Pro y WhatsApp;
5. bindings disponibles;
6. D1 creado y vinculado;
7. migraciones aplicadas;
8. secretos configurados;
9. Mercado Pago Checkout Pro y webhook;
10. autenticación administrativa propia y Access opcional;
11. activación de Checkout Pro;
12. activación analítica;
13. pruebas de humo.
14. R2, buckets y binding de imágenes administrativas.

## Variables y secretos

No almacenar secretos en Git ni exponerlos mediante variables `VITE_*`.

Los nombres y requisitos concretos se obtienen desde:

- `.env.example`;
- `wrangler.example.jsonc`;
- `server/config.ts`;
- `docs/COMMERCE_DEPLOYMENT.md`.

Los números de WhatsApp, dominios públicos y Links de Pago no son secretos, pero sólo pueden incorporarse cuando hayan sido autorizados expresamente.

## D1

Las migraciones versionadas son `0001` a `0014` y deben aplicarse en orden sin modificar las ya publicadas. `0009` incorpora el legado Mercado Libre, `0010` la liberación terminal legacy, `0011` el control local legacy, `0012_dux_authoritative_inventory.sql` la proyección y los guards Dux, `0013_remove_local_catalog_stock.sql` retira la autoridad de stock local del catálogo activo y `0014_dux_atomic_inventory_snapshots.sql` agrega generaciones, publicación atómica y `dux_d1_write_budget`. La evidencia histórica del 2026-08-22 cubre sólo `0001` a `0008`; la verificación del 2026-09-01 confirma que `0010` a `0013` ya están aplicadas en ambas D1 remotas. `0014` continúa pendiente hasta el cutover. Cada sesión futura debe volver a comprobar la lista efectiva en vez de inferirla por esta documentación.

El endpoint `/query` de D1 devolvió `7500 incomplete input` al intentar `0008` con triggers y revirtió todo. El cierre usó `wrangler d1 execute --file`, que invoca el import oficial, con el SQL versionado y la inserción exacta de su nombre en `d1_migrations`; producción sólo se migró después de la verificación funcional y limpieza de preview.

Antes de aplicarlas:

- confirmar dos bases separadas y sus entornos;
- usar `shekinah-commerce` sólo para producción y `shekinah-commerce-preview` sólo para preview;
- conservar un plan de reversión;
- revisar el SQL real;
- ejecutar primero en un entorno no productivo cuando exista;
- registrar la salida completa.

## R2 e imágenes administrativas

El candidato de código usa el binding `CATALOG_IMAGES` con aislamiento entre entornos:

- producción: bucket existente `shekinah`;
- preview: bucket aislado `shekinah-preview`.

Las rutas first-party aceptan únicamente JPEG, PNG y WebP de hasta 4 MiB y validan magic bytes en servidor. Las referencias se persisten en la mutación D1 existente; los binarios viven en R2. Un reemplazo no borra la imagen anterior hasta persistir la nueva referencia, y nunca elimina assets legacy.

R2 y ambos bindings quedaron verificados por API. Los buckets conservan clase Standard/default y `publicR2DevEnabled=false`; no habilitar un dominio público `r2.dev`, porque la lectura debe pasar por la ruta first-party de Pages. La relectura de Pages confirmó que `DB`, variables, nombres de secretos administrativos y `fail_open=false` no cambiaron. No considerar productiva la capacidad del candidato hasta verificar deployment del SHA exacto y smoke autenticado de upload/reemplazo/delete.

## Mercado Pago

### Link de Pago retirado

El carrito no expone URL fija, copia de total ni ingreso manual de monto. Con Checkout cerrado, el botón queda deshabilitado. WhatsApp no crea pedidos ni reservas nuevas mientras Dux permanezca fail-closed; los pedidos históricos se preservan únicamente para auditoría y compatibilidad.

### Checkout Pro integrado pendiente de activación

- usar primero credenciales de prueba;
- configurar secretos fuera de Git;
- registrar la URL definitiva del webhook;
- no aceptar precios ni estados enviados por el cliente;
- comprobar firma, consulta autoritativa e idempotencia.
- renovar toda credencial expuesta y actualizarla directamente como secreto cifrado;
- suscribir únicamente eventos de pagos, porque la Function no procesa otros tópicos;
- validar reserva, pago pendiente, aprobación, idempotencia, consumo de stock y reconciliación mediante un pago real controlado antes de habilitar el botón público.

## Autenticación administrativa

La protección primaria es server-side: PBKDF2 para la credencial, cookie `__Host-` HMAC de ocho horas y middleware para todo `/api/admin/*` excepto las tres rutas exactas de autenticación. Los cuatro valores `ADMIN_*` son secretos cifrados por entorno. El rate limiting depende de D1 y de `0005_admin_auth.sql`.

Cloudflare Access no es obligatorio. El JWT interno se conserva como fallback cuando no existe cookie propia. No aplicar una política externa a `/admin*` o a todo `/api/admin/*` que intercepte el login antes de Pages Functions.

## Activación

- WhatsApp: número autorizado, pero creación de pedidos bloqueada hasta demostrar el lifecycle Dux; Link de Pago manual retirado;
- Checkout Pro automatizado: integración financiera conservada; activación productiva bloqueada hasta demostrar el corte read-only desde Pages, el mapping, la semántica y el lifecycle Dux, además del pago sandbox pendiente;
- analítica first-party: habilitada desde el 2026-08-11 en preview y producción, siempre bajo consentimiento y con retención 730;
- administración: configuración externa lista; sólo se considera productiva sobre un SHA con deployment y smoke autenticado verificados.

## Verificación

Después del despliegue:

- comprobar rutas públicas;
- comprobar encabezados;
- comprobar que WhatsApp use el número `5492236216559` y el mensaje incluya carrito y total;
- comprobar que no exista enlace, monto manual ni navegación fija de Mercado Pago;
- comprobar que los endpoints server-side deshabilitados fallen de forma segura;
- comprobar administración protegida;
- comprobar que Checkout Pro y WhatsApp fallen cerrados mientras el lifecycle Dux no esté demostrado;
- comprobar webhook con eventos controlados antes de activar Checkout Pro;
- comprobar que ningún secreto aparezca en respuestas o bundles.
- comprobar mapping Dux, snapshot fresco y cantidades decimales exactas sin fallback local;
- comprobar que unidad y paso comprable provengan sólo de un contrato oficial verificado;
- comprobar formato/tamaño/firma, rutas first-party y cleanup en R2 sin tocar assets legacy ni habilitar `r2.dev`.

La configuración de Pages, D1, migraciones `0001` a `0006`, bindings `DB`/`CATALOG_IMAGES`, nombres de secretos administrativos y analíticos, `Fail closed` y aislamiento R2 quedó verificada el 2026-08-11. Zero Trust/Access continúa ausente por diseño opcional y Mercado Pago Checkout Pro permanece deshabilitado. El SHA funcional `bcb6ec0956fa46bba95b2bb5aa8b645657202da8`, CI `31452548845`, deployments y smokes analíticos quedaron comprobados; el smoke autenticado de administración no se repitió por ausencia de credencial en claro.

La verificación posterior del 2026-09-01 no reemplaza ese historial: agrega las migraciones Dux remotas hasta `0013`, CI `#416`, deployment `8781412e-629b-4473-8081-89c6fbc1ffec` sobre `f138820`, el candidato funcional `39ab007` validado localmente y la decisión explícita de mantener todas las capacidades comerciales y de reconciliación cerradas hasta verificar el SHA publicado.
