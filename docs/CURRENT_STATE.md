# Estado actual

Fecha de la fotografía: 2026-07-28.

Base remota inspeccionada antes de iniciar este cierre documental:

`bb84220780321d42828725de0d53309c1ef86129` — `docs: recover block 6 publication record`.

Este SHA es una referencia de inspección, no un valor permanente. Resolver nuevamente `origin/main` antes de cualquier trabajo y consultar el historial para identificar el commit que contiene esta fotografía.

## Producto

Shekinah es una aplicación web estática para un negocio de hierbas y especias.

El estado actual no publica productos ni datos de contacto. La ausencia de esos datos es deliberada y no constituye un defecto que deba completarse con información ficticia.

## Arquitectura

- React y React DOM.
- TypeScript estricto.
- Vite.
- SPA estática con salida en `dist`.
- Navegación con History API y enlaces HTML reales.
- Sin dependencia externa de routing.
- Sin backend.
- Sin base de datos.
- Sin autenticación.
- Sin peticiones a APIs.
- Sin formularios, carrito, pagos, analítica, publicidad ni trackers.

El mapa técnico completo se mantiene en `docs/ARCHITECTURE.md`.

## Rutas públicas

- `/`;
- `/enfoque`;
- `/catalogo`;
- `/privacidad`.

Cualquier otra ruta se resuelve como `not-found` y muestra la vista 404 de la aplicación. Bajo el fallback SPA estático, esa vista puede recibirse con estado HTTP `200`; la limitación está documentada en `docs/design/BLOCK_5_NAVIGATION_SECURITY.md`.

## Datos comerciales

Fuente única:

`src/data/authorized-commercial-data.ts`.

Estado verificado por lectura de código:

- `authorizedProducts`: colección vacía;
- `authorizedContact`: `null`.

Los productos utilizados en pruebas se encuentran únicamente en `src/test/fixtures/` y no forman parte de la fuente de producción.

## Activo visual

Único activo autorizado:

- ruta: `public/assets/logo-shekinah.png`;
- formato: PNG;
- dimensiones: 383 × 383 px;
- tamaño: 105443 bytes;
- modo original: RGBA;
- SHA-256: `cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747`.

`scripts/verify-assets.mjs` valida firma, dimensiones, profundidad, tipo de color, tamaño y hash.

## Calidad y pruebas

Versiones y herramientas:

- Node.js fijado en `.node-version` como `24.18.0`;
- npm `>=11.0.0`;
- ESLint con reglas tipadas;
- Vitest y React Testing Library;
- Playwright con Chromium.

Cobertura estructural actual:

- cuatro pruebas de aplicación;
- nueve pruebas del modelo y consulta de catálogo;
- cuatro pruebas del componente de catálogo;
- cuatro pruebas del resolvedor de rutas;
- tres escenarios E2E.

Total documentado y verificado en el cierre del BLOQUE 6:

- Vitest: 4 archivos y 21 pruebas aprobadas;
- Playwright: 3 pruebas aprobadas.

Comandos canónicos:

```bash
npm ci
npm run install:browsers
npm run verify
npm run build:pages
```

`npm run verify` incluye E2E. `npm run build:pages` no ejecuta Playwright, pero sí lint, tipos, pruebas Vitest, build y verificadores estáticos.

## Seguridad

- `public/_headers` define CSP y encabezados restrictivos para Cloudflare Pages.
- La CSP no admite `unsafe-inline` ni `unsafe-eval`.
- `scripts/verify-security.mjs` rechaza recursos externos, peticiones de red, trackers, secretos, activos adicionales, source maps y fallbacks incompatibles.
- `scripts/verify-automation.mjs` exige un único workflow, permisos de lectura y acciones oficiales fijadas a SHA completo.

## Bloques publicados

- BLOQUE 1 — neutralización de automatizaciones legacy: `afae521d156feb2dead946f205e142a3a260d3a9`.
- BLOQUE 2 — base React/TypeScript/Vite: `45af35eedfcc9fc4629b70fc5380cf0e70695d26`.
- BLOQUE 3 — estructura visual: `b8d65dd3988a5715603bb5540af13a51d8a9afab`.
- BLOQUE 4 — modelo y catálogo: `300e59de90539619b110499bcbad0ceb2c7722b9`.
- BLOQUE 5 — navegación, privacidad y seguridad: `5bc26706f5e971ae1bcb2c15ef46c1f6ed2b9bae`.
- BLOQUE 6 — CI y preparación operativa: `d39fd3d03a4dd7fe34636e58ff7bf969d98c37be`.
- Recuperación documental del BLOQUE 6: `bb84220780321d42828725de0d53309c1ef86129`.

El historial anterior permanece conservado. La implementación legacy fue retirada del árbol mediante commits normales, no mediante reescritura del historial.

## Documentación

Documentos canónicos:

- `README.md`;
- `AGENTS.md`;
- `docs/CURRENT_STATE.md`;
- `docs/CONTINUATION.md`;
- `docs/PROVENANCE.md`;
- `docs/AUTHORIZED_ASSETS.md`;
- `docs/ARCHITECTURE.md`;
- `docs/ACCESSIBILITY.md`;
- `docs/DEPLOYMENT.md`;
- `docs/THIRD_PARTY_NOTICES.md`;
- `docs/REIMPLEMENTATION_PROGRESS.md`.

`docs/design/` conserva decisiones de cada bloque. `docs/validation/` conserva planes, intentos, fallos y evidencia de publicación. Los estados preliminares de esos registros no deben interpretarse sin leer las secciones posteriores de publicación definitiva.

## CI

El workflow vigente es `.github/workflows/ci.yml` y, por lectura de código:

- se ejecuta en push a `main`, pull request y ejecución manual;
- usa permisos `contents: read`;
- ejecuta `npm ci` y `npm run verify`;
- publica únicamente `dist` como artefacto efímero;
- no despliega ni utiliza secretos.

Durante la inspección de esta fotografía, la API disponible no expuso una ejecución de push asociada al SHA base. La configuración fue revisada por código; la conclusión remota de GitHub Actions debe verificarse nuevamente después de cada publicación.

## Despliegue

Estrategia documentada: Cloudflare Pages mediante integración Git.

Configuración prevista:

- rama: `main`;
- comando: `npm run build:pages`;
- salida: `dist`;
- Node.js: `24.18.0`;
- URL conocida a comprobar: `shekinah-7dl.pages.dev`.

La URL, el SHA desplegado y los encabezados públicos no pudieron comprobarse desde el acceso remoto utilizado para esta fotografía. No asumir que producción coincide con `main`.

## Issues y backlog

No se encontraron pull requests abiertas ni requisitos funcionales posteriores al BLOQUE 6.

Se observaron issues abiertos de uso técnico histórico: `#17`, `#21`, `#22` y `#25`. Sus títulos y cuerpos corresponden a finalizadores o payloads anteriores, no a requisitos vigentes del producto. No deben utilizarse como backlog funcional. Su cierre administrativo es una tarea separada y no requiere modificar la aplicación.

## Próximo trabajo justificable

Sin nuevos datos comerciales o requisitos explícitos, no corresponde inventar un bloque funcional.

La prioridad es:

1. confirmar CI del SHA final;
2. confirmar el despliegue de Cloudflare Pages y sus rutas;
3. corregir únicamente regresiones demostrables;
4. incorporar requisitos comerciales solo cuando sean proporcionados y autorizados;
5. mantener actualizada la evidencia documental.
