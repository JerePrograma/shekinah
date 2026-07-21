# GitHub Actions

Fecha de actualización: **2026-07-21**.

## CI

Archivo: `.github/workflows/ci.yml`.

Se ejecuta en cada push a `main` y manualmente. Usa Node.js 24 desde `.nvmrc`, `npm ci` y Chromium instalado desde el paquete local de Playwright.

Orden bloqueante:

1. `npm ci`;
2. `npm run check`;
3. `npm run lint`;
4. `npm run format:check`;
5. `npm run verify:snapshot:required`;
6. `npm run build`;
7. `npm run test:unit`;
8. `npm run test:e2e`;
9. `npm run audit:output`;
10. `npm run audit:secrets`.

La captura contra WordPress no ocurre en CI porque GitHub Actions no tiene acceso al Docker ni al `localhost` del usuario. CI verifica el snapshot versionado y sus hashes.

Mientras falte `reference-snapshot/site/index.html`, el fallo esperado es deliberado. Un verde obtenido mediante el fallback Astro sería un falso positivo y está prohibido.

## Despliegue

Archivo: `.github/workflows/deploy-cloudflare.yml`.

Se ejecuta automáticamente únicamente después de un CI exitoso de `main`, o manualmente. Resuelve y despliega el mismo SHA validado.

Secuencia:

1. exige `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`;
2. hace checkout del SHA validado;
3. ejecuta `npm ci`;
4. instala Chromium;
5. ejecuta `npm run verify` completo;
6. ejecuta `wrangler pages deploy dist` mediante el binario local;
7. verifica rutas en la URL de deployment y en el dominio estable;
8. verifica que exista un sitemap público.

La ausencia de secretos es un error de despliegue, no un estado verde ficticio.

## Acciones utilizadas

Los workflows usan líneas mayores compatibles con Node.js 24:

- `actions/checkout@v6`;
- `actions/setup-node@v6`;
- `actions/upload-artifact@v7`.

## Artefactos

CI conserva durante siete días:

- `shekinah-dist-<SHA>`;
- `playwright-report-<SHA>` cuando existe.

Los artefactos ayudan al diagnóstico, pero la fuente de producción sigue siendo el commit versionado.

## Interpretación

- **CI rojo por snapshot faltante:** ejecutar la migración local real.
- **CI rojo por hash:** el snapshot fue modificado después de generar el manifiesto.
- **CI rojo por E2E:** corregir el primer recurso, ruta o consola fallidos.
- **Deploy rojo por secretos:** configurar los dos secretos exactos.
- **Deploy rojo en Wrangler:** verificar proyecto Pages, cuenta y permiso del token.
- **Deploy verde:** aún debe verificarse dominio estable y SHA.
