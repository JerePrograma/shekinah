# Despliegue

## Configuración de Cloudflare Pages

Nombre exacto del proyecto Pages: `shekinah`

Dominio asignado: `shekinah-7dl.pages.dev`

Rama de producción: `main`

Comando de build: `npm run build:pages`

Directorio de salida: `dist`

Versión de Node.js: `24.18.0`

Directorio raíz: raíz del repositorio.

Pages Functions: `functions/`.

Configuración de referencia: `wrangler.example.jsonc`.

Existe un Worker independiente también llamado `shekinah`. Verificar siempre que la ruta del panel sea `pages/view/shekinah`; los settings bajo `workers/services/view/shekinah` pertenecen al recurso equivocado.

## Estado externo verificado el 2026-08-10

- build `npm run build:pages`, salida `dist`, rama `main` y deployments automáticos: verificados;
- binding `DB`: `shekinah-commerce` en producción y `shekinah-commerce-preview` en preview;
- migraciones `0001` a `0005`: aplicadas y sin pendientes en ambas D1;
- variables server-side mínimas y flags cerrados: presentes en ambos entornos;
- secretos administrativos: cuatro nombres cifrados presentes en ambos entornos, valores no inspeccionables;
- Zero Trust y Access: no configurados; el código lo admite sólo como fallback opcional;
- runtime de producción y preview: `Fail closed`;
- Checkout Pro y analítica: continúan deshabilitados y sin secretos de proveedor.

Como `/api/*`, `/admin` y `/admin/*` están incluidos en `public/_routes.json`, ambos entornos deben conservar `Fail closed`. Cloudflare documenta la diferencia en <https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed>.

## Configuración pública autorizada el 2026-08-10

```text
PUBLIC_SITE_URL=https://shekinah-7dl.pages.dev
VITE_WHATSAPP_NUMBER=5492236216559
VITE_MERCADO_PAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/shekinahmoreno
```

Los dos valores `VITE_*` son públicos y están incluidos como defaults autorizados en el código para permitir el fallback manual de carrito, Link de Pago y WhatsApp aunque Pages no tenga variables de build. `PUBLIC_SITE_URL` debe cargarse explícitamente como variable server-side antes de habilitar Checkout Pro.

El fallback manual no necesita VPS ni D1. El Checkout Pro integrado tampoco requiere VPS: el backend previsto son Pages Functions y D1, pero esa capacidad continúa deshabilitada hasta completar su configuración externa.

## Estados separados

Debe registrarse por separado:

1. SHA publicado en GitHub;
2. GitHub Actions para ese SHA;
3. deployment de Pages;
4. fallback manual público;
5. bindings disponibles;
6. D1 creado y vinculado;
7. migraciones aplicadas;
8. secretos configurados;
9. Mercado Pago Checkout Pro y webhook;
10. autenticación administrativa propia y Access opcional;
11. activación de Checkout Pro;
12. activación analítica;
13. pruebas de humo.

## Variables y secretos

No almacenar secretos en Git ni exponerlos mediante variables `VITE_*`.

Los nombres y requisitos concretos se obtienen desde:

- `.env.example`;
- `wrangler.example.jsonc`;
- `server/config.ts`;
- `docs/COMMERCE_DEPLOYMENT.md`.

Los números de WhatsApp, dominios públicos y Links de Pago no son secretos, pero sólo pueden incorporarse cuando hayan sido autorizados expresamente.

## D1

Las migraciones versionadas son `migrations/0001_commerce.sql`, `migrations/0002_fulfillment_and_retention.sql`, `migrations/0003_checkout_intent_cart_fingerprint.sql`, `migrations/0004_catalog_admin.sql` y `migrations/0005_admin_auth.sql`; deben aplicarse en ese orden mediante el mecanismo de migraciones de Wrangler.

Antes de aplicarlas:

- confirmar dos bases separadas y sus entornos;
- usar `shekinah-commerce` sólo para producción y `shekinah-commerce-preview` sólo para preview;
- conservar un plan de reversión;
- revisar el SQL real;
- ejecutar primero en un entorno no productivo cuando exista;
- registrar la salida completa.

## Mercado Pago

### Fallback manual actual

El Link de Pago `https://link.mercadopago.com.ar/shekinahmoreno` está autorizado como solución temporal sin monto predefinido. El carrito copia el total y abre el enlace; el comprador ingresa el monto y envía el carrito por WhatsApp. Este flujo no crea pedido ni preferencia y no verifica pagos mediante webhook.

### Checkout Pro integrado pendiente

- usar primero credenciales de prueba;
- configurar secretos fuera de Git;
- registrar la URL definitiva del webhook;
- no aceptar precios ni estados enviados por el cliente;
- comprobar firma, consulta autoritativa e idempotencia.

## Autenticación administrativa

La protección primaria es server-side: PBKDF2 para la credencial, cookie `__Host-` HMAC de ocho horas y middleware para todo `/api/admin/*` excepto las tres rutas exactas de autenticación. Los cuatro valores `ADMIN_*` son secretos cifrados por entorno. El rate limiting depende de D1 y de `0005_admin_auth.sql`.

Cloudflare Access no es obligatorio. El JWT interno se conserva como fallback cuando no existe cookie propia. No aplicar una política externa a `/admin*` o a todo `/api/admin/*` que intercepte el login antes de Pages Functions.

## Activación

- fallback manual de Link de Pago y WhatsApp: autorizado en código desde el 2026-08-10;
- Checkout Pro automatizado: deshabilitado;
- analítica: deshabilitada;
- administración: configuración externa lista; sólo se considera productiva sobre un SHA con deployment y smoke autenticado verificados.

## Verificación

Después del despliegue:

- comprobar rutas públicas;
- comprobar encabezados;
- comprobar que el Link de Pago visible tenga el `href` exacto autorizado;
- comprobar que WhatsApp use el número `5492236216559` y el mensaje incluya carrito y total;
- comprobar que usar el fallback no llame a `/api/checkout/preferences`;
- comprobar que los endpoints server-side deshabilitados fallen de forma segura;
- comprobar administración protegida;
- comprobar creación de pedidos sólo cuando Checkout Pro esté configurado;
- comprobar webhook con eventos controlados antes de activar Checkout Pro;
- comprobar que ningún secreto aparezca en respuestas o bundles.

La configuración de Pages, D1, migraciones, binding, secretos administrativos y `Fail closed` fue verificada el 2026-08-10. Zero Trust/Access continúa ausente por diseño opcional; Mercado Pago Checkout Pro y analítica permanecen deshabilitados. El deployment y smoke del candidato deben registrarse por SHA exacto.
