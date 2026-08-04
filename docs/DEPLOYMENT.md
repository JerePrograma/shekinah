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

Como `/api/*`, `/admin` y `/admin/*` están incluidos en `public/_routes.json` y contienen autenticación, privacidad y pagos, configurar ambos entornos como `Fail closed` antes de considerarlos operativos. Cloudflare documenta la diferencia en <https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed>.

## Estados separados

Debe registrarse por separado:

1. SHA publicado en GitHub;
2. GitHub Actions para ese SHA;
3. deployment de Pages;
4. bindings disponibles;
5. D1 creado y vinculado;
6. migraciones aplicadas;
7. secretos configurados;
8. Mercado Pago y webhook;
9. Cloudflare Access;
10. activación de comercio;
11. activación analítica;
12. pruebas de humo.

## Variables y secretos

No almacenar secretos en Git ni exponerlos mediante variables `VITE_*`.

Los nombres y requisitos concretos se obtienen desde:

- `.env.example`;
- `wrangler.example.jsonc`;
- `server/config.ts`;
- `docs/COMMERCE_DEPLOYMENT.md`.

## D1

Las migraciones versionadas son `migrations/0001_commerce.sql`, `migrations/0002_fulfillment_and_retention.sql` y `migrations/0003_checkout_intent_cart_fingerprint.sql`; deben aplicarse en ese orden mediante el mecanismo de migraciones de Wrangler.

Antes de aplicarla:

- confirmar dos bases separadas y sus entornos;
- usar `shekinah-commerce` sólo para producción y no inventar el nombre de preview;
- conservar un plan de reversión;
- revisar el SQL real;
- ejecutar primero en un entorno no productivo cuando exista;
- registrar la salida completa.

## Mercado Pago

- usar primero credenciales de prueba;
- configurar secretos fuera de Git;
- registrar la URL definitiva del webhook;
- no aceptar precios ni estados enviados por el cliente;
- comprobar firma, consulta autoritativa e idempotencia.

## Cloudflare Access

Las rutas `/admin*` y `/api/admin/*` deben quedar protegidas antes de considerarse operativas.

La validación JWT interna devuelve 401 sin Access, pero no sustituye la política de borde requerida. El Team Domain y el AUD deben provenir de la aplicación creada, nunca de un valor inferido.

## Activación

Comercio, analítica y WhatsApp permanecen deshabilitados hasta que cada requisito esté configurado y autorizado.

## Verificación

Después del despliegue:

- comprobar rutas públicas;
- comprobar encabezados;
- comprobar que los endpoints deshabilitados fallen de forma segura;
- comprobar administración protegida;
- comprobar creación de pedidos sólo cuando Mercado Pago esté configurado;
- comprobar webhook con eventos controlados;
- comprobar que ningún secreto aparezca en respuestas o bundles.

El deployment de Pages y su configuración vacía fueron verificados el 2026-08-04. D1, secretos, bindings, Access y activación productiva siguen ausentes.
