# Shekinah

[![CI](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml/badge.svg)](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml)

Aplicación pública de Shekinah construida con React, TypeScript y Vite. El HTML de cada ruta se prerenderiza durante el build para conservar navegación directa, SEO técnico, accesibilidad y compatibilidad con Cloudflare Pages.

## Estado arquitectónico

- Rama operativa y de despliegue: `main`.
- Fuente de verdad: `src/content.ts`, componentes React, estilos y activos de `public/`.
- WordPress, PHP, MariaDB, WP-CLI, Docker y el snapshot capturado dejaron de formar parte del build y del despliegue.
- Directorio publicado: `dist/`.
- Proyecto Cloudflare Pages: `shekinah`.
- Dominio estable: `https://shekinah-7dl.pages.dev`.

## Arquitectura

```text
src/content.ts
  + componentes React
  + activos public/
  → Vite client build
  → Vite SSR build temporal
  → scripts/prerender.mjs
  → HTML por ruta + sitemap + robots + redirects
  → dist/
  → GitHub Actions
  → Cloudflare Pages
```

La aplicación no depende de una API, base de datos o CMS en tiempo de ejecución. Los enlaces públicos usan documentos prerenderizados; React hidrata el menú y el comportamiento interactivo sin ocultar el contenido a navegadores o rastreadores.

## Comandos

```bash
npm install --package-lock=false --no-audit --no-fund
npm run dev
npm run lint
npm run format:check
npm run build
npm run test:unit
npm run install:browsers
npm run test:e2e
npm run audit:output
npm run audit:secrets
npm run verify
```

## Rutas principales

- `/`
- `/nosotros/`
- `/tienda/`
- `/blog/`
- `/recetas/`
- `/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/`
- `/el-viaje-de-las-especias-sabor-y-bienestar/`
- `/chocolate-casero/`
- `/receta-barra-de-cereal/`
- `/terms-and-conditions/`

Se conservan redirecciones permanentes para `/inicio/` y `/terminos-condiciones/`. La ruta histórica `/category/uncategorized/` permanece como página `noindex` para no romper enlaces antiguos.

## Calidad y seguridad

El flujo verifica TypeScript estricto, ESLint, formato básico, prerender, rutas, accesibilidad básica, errores de consola, canonicals, JSON-LD, sitemap, recursos rotos, tamaños de Cloudflare Pages y posibles secretos. No se publican sourcemaps, endpoints WordPress, archivos PHP, SQL, configuraciones privadas ni formularios inertes.

## Documentación

- [Estado de migración](docs/MIGRATION-STATUS.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [GitHub Actions](docs/GITHUB-ACTIONS.md)
- [Pruebas](docs/TEST-REPORT.md)
- [Rollback](docs/ROLLBACK.md)
