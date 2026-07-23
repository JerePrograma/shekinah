# Shekinah

[![CI and GitHub Pages](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml/badge.svg)](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml)

Sitio oficial de Shekinah construido con React, TypeScript y Vite. La aplicación publica un catálogo navegable, páginas de producto, categorías, contenidos editoriales, recetas y un carrito local con consulta por WhatsApp.

## Producción

- Rama de publicación: `main`.
- Sitio: `https://jereprograma.github.io/shekinah/`.
- Alojamiento: GitHub Pages.
- Fuente de verdad: código, contenido y activos versionados en este repositorio.

## Arquitectura

```text
src/generated/*.json
  → scripts/prepare-public-data.mjs
  → src/generated-public/*.json
  → src/content.ts + src/catalog.ts
  → aplicación React
  → build Vite cliente y SSR temporal
  → prerender de rutas estáticas
  → auditoría integral del bundle
  → dist/
  → GitHub Actions
  → GitHub Pages
```

La preparación de datos publica solamente los campos utilizados por la tienda. Metadatos internos, dominios anteriores e identificadores técnicos no ingresan al bundle final.

La aplicación no requiere API, base de datos ni CMS en tiempo de ejecución. El carrito se conserva en el navegador y prepara una consulta por WhatsApp; no procesa pagos.

## Comandos

```bash
npm install --package-lock=false --no-audit --no-fund
npm run dev
npm run validate:content
npm run lint
npm run format:check
npm run build
npm run test:unit
npm run install:browsers
npm run test:e2e
npm run audit:output
npm run audit:copy
npm run audit:secrets
npm run verify
```

Para generar localmente el resultado exacto de GitHub Pages:

```bash
SITE_BASE_PATH=/shekinah/ SITE_ORIGIN=https://jereprograma.github.io/shekinah npm run build
SITE_BASE_PATH=/shekinah/ SITE_ORIGIN=https://jereprograma.github.io/shekinah npm run audit:output
SITE_BASE_PATH=/shekinah/ SITE_ORIGIN=https://jereprograma.github.io/shekinah npm run audit:copy
```

## Rutas principales

- `/`
- `/nosotros/`
- `/tienda/`
- `/blog/`
- `/recetas/`
- páginas individuales de producto
- categorías de la tienda
- artículos y recetas
- `/terms-and-conditions/`

## Seguridad

No se publican archivos de entorno, credenciales, bases de datos, configuraciones privadas, copias comprimidas ni dependencias de servidor. El workflow bloquea el despliegue si fallan el análisis estático, las pruebas, el build o las auditorías.

## Documentación

- [Despliegue](docs/DEPLOYMENT.md)
- [GitHub Actions](docs/GITHUB-ACTIONS.md)
- [Pruebas](docs/TEST-REPORT.md)
- [Rollback](docs/ROLLBACK.md)
