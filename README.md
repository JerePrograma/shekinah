# Shekinah

[![CI](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml/badge.svg)](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml)
[![Cloudflare Pages](https://github.com/JerePrograma/shekinah/actions/workflows/deploy-cloudflare.yml/badge.svg)](https://github.com/JerePrograma/shekinah/actions/workflows/deploy-cloudflare.yml)

Sitio oficial de Shekinah construido con React, TypeScript y Vite. La aplicación publica un catálogo navegable, páginas de producto, categorías, contenidos editoriales, recetas y un carrito local con consulta por WhatsApp.

## Producción

- Rama de publicación: `main`.
- Sitio: `https://shekinah-7dl.pages.dev/`.
- Alojamiento: Cloudflare Pages.
- Publicación: GitHub Actions mediante Wrangler, después de validar el SHA exacto.
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
  → Wrangler
  → Cloudflare Pages
```

La preparación de datos publica solamente los campos utilizados por la tienda. Metadatos internos, dominios anteriores e identificadores técnicos no ingresan al bundle final.

La aplicación no requiere API, base de datos ni CMS en tiempo de ejecución. El carrito se conserva en el navegador y prepara una consulta por WhatsApp; no procesa pagos.

## CI/CD

El workflow `CI` valida cada push a `main`. Si el run termina correctamente, `Deploy Cloudflare Pages` recibe el SHA validado, reconstruye y audita `dist/`, publica con Wrangler, espera que Cloudflare lo promueva como deployment canónico de producción y verifica el dominio estable.

Los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` se leen desde GitHub Actions y no forman parte del repositorio ni del bundle público.

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
npm run deploy:cloudflare
```

Para generar localmente el resultado equivalente a producción:

```bash
SITE_BASE_PATH=/ SITE_ORIGIN=https://shekinah-7dl.pages.dev npm run build
SITE_BASE_PATH=/ SITE_ORIGIN=https://shekinah-7dl.pages.dev npm run audit:output
SITE_BASE_PATH=/ SITE_ORIGIN=https://shekinah-7dl.pages.dev npm run audit:copy
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

No se publican archivos de entorno, credenciales, bases de datos, configuraciones privadas, copias comprimidas ni dependencias de servidor. La publicación solo se ejecuta después de una validación completa y utiliza el SHA aprobado por CI.

## Documentación

- [Despliegue](docs/DEPLOYMENT.md)
- [GitHub Actions](docs/GITHUB-ACTIONS.md)
- [Pruebas](docs/TEST-REPORT.md)
- [Rollback](docs/ROLLBACK.md)
