# Despliegue

## Configuración de Cloudflare Pages

Rama de producción: `main`

Comando de build: `npm run build:pages`

Directorio de salida: `dist`

Versión de Node.js: `24.18.0`

Directorio raíz: raíz del repositorio.

Pages Functions: `functions/`.

Configuración de referencia: `wrangler.example.jsonc`.

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

La migración inicial está versionada en `migrations/0001_commerce.sql`.

Antes de aplicarla:

- confirmar base y entorno;
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

Este documento no afirma confirmación efectiva del despliegue, verificación efectiva de producción ni una conexión operativa de Cloudflare.