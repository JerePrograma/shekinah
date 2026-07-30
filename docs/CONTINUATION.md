# Continuación del proyecto

## Propósito

Este documento permite retomar Shekinah sin depender de conversaciones anteriores. Código, pruebas, manifiestos e historial de `origin/main` son la fuente de verdad.

## Lectura inicial

Leer en este orden:

1. `README.md`;
2. `AGENTS.md`;
3. `docs/CURRENT_STATE.md`;
4. `docs/ARCHITECTURE.md`;
5. `docs/PROVENANCE.md`;
6. `docs/AUTHORIZED_ASSETS.md`;
7. `docs/ACCESSIBILITY.md`;
8. `docs/DEPLOYMENT.md`;
9. `docs/REIMPLEMENTATION_PROGRESS.md`;
10. documentos pertinentes de `docs/design/` y `docs/validation/`.

Los registros de `docs/validation/` son históricos: preservar intentos fallidos y leer el cierre completo antes de interpretar su estado.

## Inicio obligatorio

```bash
git status --short --branch
git branch --show-current
git switch main
git fetch origin
git pull --ff-only origin main
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

Inventariar y preservar cambios locales ajenos. No crear ramas, worktrees, stashes o PR sin solicitud expresa; no reescribir historial ni usar force-push.

## Decisiones estables

- React, TypeScript estricto y Vite;
- SPA estática sin backend, autenticación, base de datos ni APIs de ejecución;
- History API y router propio;
- rutas institucionales más 510 productos y 16 categorías históricas;
- `src/data/authorized-commercial-data.ts` como fuente tipada de producción;
- índice público estático y detalle local diferido;
- 24 productos por página;
- contacto en `null`;
- logo y 484 imágenes exactas declaradas en el manifiesto;
- datos comerciales capturados el 23/07/2026, no en tiempo real;
- GitHub Actions valida; Cloudflare Pages despliega mediante integración Git;
- historial conservado sin reutilizar la implementación legacy.

No incorporar WordPress, PHP, recetas, checkout, carrito, pagos, contactos, recursos remotos, trackers ni datos inventados.

## Fuente y regeneración del catálogo

La fuente seleccionada es el commit `7e39c5535800fdda31a48846f977fe5c1c05eb3f`. Los blobs, hashes, métricas y faltantes se registran en `docs/PROVENANCE.md` y `catalog/catalog-manifest.json`.

El build no depende del historial Git. Solo para una actualización deliberada y auditada:

1. extraer desde Git los paths históricos requeridos a un directorio temporal;
2. no modificar el checkout con un árbol legacy;
3. ejecutar `node scripts/prepare-catalog-data.mjs <directorio-historico-extraido>`;
4. revisar los datos y manifiestos generados;
5. ejecutar la validación completa.

El script debe conservar exactamente 510 productos, 16 categorías, 510 precios, 495 descripciones, 432 SKU, 509 referencias y 484 binarios. Los 15 productos sin descripción y `Caldo sin sal en polvo` sin imagen son faltantes históricos válidos.

## Contrato de datos públicos

- los identificadores públicos son slugs legibles;
- las rutas históricas se conservan;
- precio y moneda ARS son obligatorios;
- presentación, SKU, disponibilidad, descripciones, imagen y variantes son opcionales;
- los campos ausentes se omiten, nunca se rellenan;
- solo se publican variantes comercialmente diferenciadas;
- no se publica HTML histórico, URLs externas, evidencia técnica ni IDs internos.

## Validación

Instalación limpia y navegador:

```bash
npm ci
npm run install:browsers
```

Gate integral:

```bash
npm run verify
npm run build:pages
git diff --check
git diff --cached --check
```

`npm run verify` ejecuta catálogo, ESLint, TypeScript, 31 pruebas Vitest, build, activos, seguridad, automatización y 5 escenarios Playwright. `npm run build:pages` repite todos los controles publicables excepto Playwright.

Pruebas principales:

- `src/App.test.tsx`: vistas institucionales, catálogo, producto, categoría y 404;
- `src/catalog/catalog.test.ts`: validación, opcionales, búsqueda, filtro, paginación y formato;
- `src/catalog/CatalogSection.test.tsx`: 510 productos, 24 por página, estados y faltantes;
- `src/routing/routes.test.ts`: 510 productos, 16 categorías, normalización, metadatos y 404;
- `tests/e2e/app.spec.ts`: build compilado, navegación, búsqueda, filtro, paginación, fichas, teclado, foco y viewports.

Verificadores:

- `scripts/verify-catalog.mjs`: métricas, relaciones, orden, hashes y exclusiones públicas;
- `scripts/verify-assets.mjs`: allowlist, firmas, hashes, referencias y huérfanos;
- `scripts/verify-security.mjs`: CSP, bundle, red, URLs, IDs internos, secretos y source maps;
- `scripts/verify-automation.mjs`: scripts, Node.js, workflow, permisos y documentos.

## Revisión manual proporcional

Ante cambios de interfaz, revisar como mínimo:

- `/`, `/enfoque`, `/catalogo` y `/privacidad`;
- una categoría y rutas de producto con y sin imagen;
- ruta desconocida;
- búsqueda, filtro, paginación y navegación atrás;
- teclado, foco y anchos 320, 390, 768 y 1440;
- consola, solicitudes externas, MIME y encabezados.

## Publicación

Antes de publicar:

1. revisar `git status`, `git diff --stat`, `git diff --check` y `git diff --name-status`;
2. comprobar que `package-lock.json` no cambió;
3. buscar secretos, temporales, archivos comprimidos y código legacy;
4. ejecutar `git fetch origin` y confirmar fast-forward;
5. preparar únicamente rutas explícitas;
6. revisar `git diff --cached --check` y el stage completo;
7. crear un commit atómico y hacer `git push origin main` normal;
8. confirmar el SHA final de `origin/main`.

## Evidencia remota

Para el SHA definitivo:

- comprobar el run de `.github/workflows/ci.yml`, cada paso y el artefacto `shekinah-dist-<sha>`;
- comprobar en Cloudflare Pages rama, SHA y conclusión del deployment;
- verificar el dominio, encabezados, MIME, consola y ausencia de solicitudes externas;
- comprobar los 510 paths por HTTP y una muestra representativa mediante navegador.

No inferir la asociación de Cloudflare desde el contenido visual si el proveedor no expone el SHA.

## Clasificación del cierre

- `verificado`: comando o control ejecutado satisfactoriamente;
- `revisado por código`: conclusión estática sin ejecución equivalente;
- `no disponible`: acceso o herramienta externa inaccesible;
- `fallido`: control ejecutado con resultado no satisfactorio.

Detenerse solo ante permisos ausentes, historial inaccesible, conflicto remoto inseguro, riesgo de pérdida de datos o una decisión comercial irreversible no deducible de la fuente.
