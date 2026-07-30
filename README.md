# Shekinah

Aplicación web estática de **Shekinah, hierbas y especias**, reconstruida por bloques verificables.

## Estado actual

La aplicación incluye:

- interfaz responsive;
- navegación interna mediante History API;
- páginas de inicio, enfoque, catálogo y privacidad;
- 510 productos históricos con 16 categorías, búsqueda, filtros y paginación;
- fichas individuales y rutas históricas de productos y categorías;
- vista 404 controlada por la aplicación;
- catálogo comercial capturado el 23/07/2026, sin afirmar precios o stock actuales;
- encabezados de seguridad para Cloudflare Pages;
- pruebas unitarias, de componentes y E2E;
- integración continua de solo lectura.

El catálogo conserva los datos y faltantes de la fuente histórica versionada: 15 productos no tienen descripción completa y `Caldo sin sal en polvo` no tiene imagen. El contacto permanece ausente y no se publican datos comerciales ficticios.

## Requisitos

- Node.js `24.18.0`;
- npm `11` o superior;
- Chromium de Playwright para la validación completa.

La versión exacta de Node.js se registra en `.node-version`.

## Instalación

```bash
npm ci
```

## Desarrollo

```bash
npm run dev
```

## Validación completa

```bash
npm run install:browsers
npm run verify
```

En Linux CI, Chromium se instala con sus dependencias del sistema antes de ejecutar `npm run verify`.

## Build para Cloudflare Pages

```bash
npm run build:pages
```

El resultado queda en `dist`. Este comando ejecuta la integridad del catálogo, lint, tipos, pruebas unitarias, build y verificaciones de activos, seguridad y automatización. Las pruebas E2E se ejecutan en GitHub Actions mediante `npm run verify`.

## Catálogo versionado

Los datos públicos sanitizados se encuentran en `src/catalog-data/`; los manifiestos de integridad están en `catalog/` y las imágenes exactas en `public/images/original/catalog/`. El detalle completo se carga mediante un chunk local diferido, sin `fetch` ni APIs remotas.

Para regenerar esos archivos se debe exportar primero la fuente histórica documentada en `docs/PROVENANCE.md` y ejecutar:

```bash
node scripts/prepare-catalog-data.mjs <directorio-histórico-extraído>
npm run verify:catalog
```

El build de producción usa los archivos ya versionados y no depende de Git ni de Hostinger.

## Inicio para agentes

- [Instrucciones operativas](AGENTS.md)
- [Estado actual](docs/CURRENT_STATE.md)
- [Continuación del proyecto](docs/CONTINUATION.md)

Esos documentos forman la ruta de entrada para una sesión nueva. Los SHA registrados son fotografías históricas y deben revalidarse contra `origin/main`.

## Arquitectura y operación

- [Procedencia](docs/PROVENANCE.md)
- [Activos autorizados](docs/AUTHORIZED_ASSETS.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Accesibilidad](docs/ACCESSIBILITY.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [Avisos de terceros](docs/THIRD_PARTY_NOTICES.md)
- [Registro de reimplementación](docs/REIMPLEMENTATION_PROGRESS.md)

Las decisiones de cada bloque se conservan en `docs/design/`. Los planes, fallos y resultados de validación se conservan en `docs/validation/` como evidencia histórica y no deben reescribirse para ocultar etapas anteriores.

## Automatización

`.github/workflows/ci.yml` valida pushes a `main`, pull requests y ejecuciones manuales. El workflow no despliega, no usa secretos y solo dispone de permiso de lectura del repositorio.

Cloudflare Pages debe configurarse mediante integración Git usando `main`, `npm run build:pages` y `dist`. La conexión y el estado del despliegue se verifican fuera del repositorio, en el panel de Cloudflare.
