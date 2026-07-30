# Continuación del proyecto

## Propósito

Este documento permite retomar Shekinah desde el estado real de `origin/main`, sin depender de conversaciones anteriores.

## Lectura inicial

1. `README.md`;
2. `AGENTS.md`;
3. `docs/CURRENT_STATE.md`;
4. `docs/ARCHITECTURE.md`;
5. `docs/PROVENANCE.md`;
6. `docs/AUTHORIZED_ASSETS.md`;
7. `docs/ACCESSIBILITY.md`;
8. `docs/DEPLOYMENT.md`.

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

Preservar cambios locales ajenos. No crear ramas, worktrees, stashes ni PR salvo pedido expreso. No reescribir historial ni usar force-push.

## Decisiones estables

- React, TypeScript estricto y Vite;
- SPA estática sin backend, autenticación, base de datos ni APIs remotas;
- router propio basado en History API;
- rutas de inicio, catálogo, privacidad, productos, categorías y 404;
- 510 productos y 16 categorías;
- 24 productos por página;
- detalle local cargado de forma diferida;
- contacto en `null`;
- logo y 484 imágenes declaradas en manifiestos;
- catálogo público sin metadatos internos;
- GitHub Actions valida y Cloudflare Pages publica mediante integración Git.

No incorporar recetas, checkout, carrito, pagos, contactos, recursos remotos, rastreadores ni datos inventados.

## Contrato de datos públicos

- los identificadores públicos son slugs legibles;
- precio y moneda ARS son obligatorios;
- presentación, SKU, disponibilidad, descripciones, imagen y variantes son opcionales;
- los campos ausentes se omiten;
- solo se publican variantes comercialmente diferenciadas;
- no se publican fechas internas, IDs técnicos, HTML de origen, URLs externas ni evidencia de integridad;
- `config/catalog-index-plugin.ts` elimina metadatos internos antes de entregar el índice a Vite y Vitest.

## Preparación del catálogo

Para una actualización deliberada:

1. obtener el directorio fuente autorizado;
2. ejecutar `node scripts/prepare-catalog-data.mjs <directorio-fuente-extraido>`;
3. revisar manifiestos, conteos y activos;
4. ejecutar la validación completa.

El proceso debe conservar 510 productos, 16 categorías, 510 precios, 495 descripciones, 432 SKU, 509 referencias y 484 imágenes. Los campos comerciales ausentes no se completan.

## Validación

```bash
npm ci
npm run install:browsers
npm run verify
npm run build:pages
git diff --check
git diff --cached --check
```

Pruebas principales:

- `src/App.test.tsx`: portada, navegación, catálogo, producto, categoría, privacidad y 404;
- `src/catalog/catalog.test.ts`: modelo, búsqueda, filtro, paginación y precios;
- `src/catalog/CatalogSection.test.tsx`: listado, controles, estados e imágenes;
- `src/routing/routes.test.ts`: rutas institucionales, 510 productos, 16 categorías y colisiones;
- `tests/e2e/app.spec.ts`: build compilado, navegación, fichas, teclado, foco, viewports y red.

Verificadores:

- `scripts/verify-catalog.mjs`: métricas, relaciones y exclusiones públicas;
- `scripts/verify-assets.mjs`: allowlist, firmas, hashes y referencias;
- `scripts/verify-security.mjs`: CSP, bundle, red, copy público, secretos y source maps;
- `scripts/verify-automation.mjs`: scripts, Node.js, workflow, permisos y documentación.

## Revisión manual

Revisar como mínimo:

- `/`, `/catalogo` y `/privacidad`;
- una categoría;
- productos con y sin imagen;
- productos con y sin descripción;
- una ruta desconocida;
- búsqueda, filtro, paginación y navegación atrás;
- teclado, foco y anchos 320, 390, 768 y 1440;
- consola, solicitudes externas, MIME y encabezados.

## Publicación

1. revisar `git status`, `git diff --stat`, `git diff --check` y `git diff --name-status`;
2. comprobar que `package-lock.json` e imágenes no cambiaron;
3. preparar únicamente rutas explícitas;
4. crear un commit atómico;
5. hacer `git push origin main` normal;
6. verificar el run de CI y su artefacto;
7. verificar el deployment de Cloudflare y el contenido servido.

Clasificación del cierre:

- `verificado`: control ejecutado satisfactoriamente;
- `revisado por código`: conclusión estática;
- `no disponible`: acceso o herramienta ausente;
- `fallido`: control ejecutado con resultado no satisfactorio.
