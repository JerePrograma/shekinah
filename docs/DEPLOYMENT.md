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

## Estado externo verificado el 2026-08-04

- build `npm run build:pages`, salida `dist`, rama `main` y deployments automáticos: verificados;
- variables y secretos de producción/preview: ausentes;
- bindings de producción/preview: ausentes;
- bases D1 en la cuenta: cero;
- Zero Trust y Access: no configurados;
- previews: públicos;
- runtime de producción y preview: `Fail open`.

Como `/api/*`, `/admin` y `/admin/*` están incluidos en `public/_routes.json` y contienen autenticación, privacidad y pagos, configurar ambos entornos como `Fail closed` antes de considerar operativas esas superficies serverless. Cloudflare documenta la diferencia en <https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed>.

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
10. Cloudflare Access;
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

Las migraciones versionadas son `migrations/0001_commerce.sql`, `migrations/0002_fulfillment_and_retention.sql`, `migrations/0003_checkout_intent_cart_fingerprint.sql` y `migrations/0004_catalog_admin.sql`; deben aplicarse en ese orden mediante el mecanismo de migraciones de Wrangler.

Antes de aplicarlas:

- confirmar dos bases separadas y sus entornos;
- usar `shekinah-commerce` sólo para producción y no inventar el nombre de preview;
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

## Cloudflare Access

Las rutas `/admin*` y `/api/admin/*` deben quedar protegidas antes de considerarse operativas.

La validación JWT interna devuelve 401 sin Access, pero no sustituye la política de borde requerida. El Team Domain y el AUD deben provenir de la aplicación creada, nunca de un valor inferido.

## Activación

- fallback manual de Link de Pago y WhatsApp: autorizado en código desde el 2026-08-10;
- Checkout Pro automatizado: deshabilitado;
- analítica: deshabilitada;
- administración: no considerada productiva hasta configurar Access y `Fail closed`.

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

El deployment de Pages y su configuración vacía fueron verificados el 2026-08-04. D1, secretos, bindings, Access y activación de Checkout Pro siguen ausentes hasta nueva evidencia.
