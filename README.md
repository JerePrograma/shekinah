# Shekinah

[![CI](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml/badge.svg)](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml)

Aplicación pública de Shekinah construida con React, TypeScript y Vite. El HTML de cada ruta se prerenderiza para conservar navegación directa, SEO técnico, accesibilidad y compatibilidad con Cloudflare Pages.

## Estado real

- Rama operativa y de despliegue: `main`.
- Dominio estable: `https://shekinah-7dl.pages.dev`.
- Dominio original auditado: `https://herbalarioonline.com`.
- Fuente de verdad productiva: código React, contenido TypeScript/JSON y activos de `public/`.
- WordPress se utiliza únicamente como evidencia complementaria fuera del build.
- El catálogo no se declara completo: solo se publican entidades con evidencia y los faltantes quedan documentados.

## Arquitectura

```text
HTML Hostinger / contenido público / referencia WordPress
  → scripts/crawl-hostinger-original.mjs
  → scripts/import-hostinger-original.mjs
  → evidencia y manifiestos deterministas
  → src/generated/*.json
  → src/catalog.ts + src/siteApp.tsx
  → Vite client + SSR temporal
  → scripts/prerender.mjs
  → dist/ + sitemap + robots + redirects
  → GitHub Actions
  → Cloudflare Pages
```

La aplicación no depende de una API, base de datos o CMS en tiempo de ejecución. El carrito se almacena localmente con versión de esquema y genera una consulta por WhatsApp; no procesa pagos ni envía información sin una acción explícita.

## Contenido recuperado y publicado

- Páginas institucionales, blog, recetas y términos ya versionados.
- Dos productos públicos usados como controles de recuperación:
  - `/guayaba/`
  - `/melena-de-leon-futuro-fungi-50ml/`
- Categorías finales navegables:
  - `/tienda/categoria/hierbas-medicinales/`
  - `/tienda/categoria/suplementos/`
- Precios ARS etiquetados como históricos con fecha de captura `2026-07-23`.
- Carrito local, cantidades, eliminación, subtotal informativo y WhatsApp verificado.
- Product JSON-LD, breadcrumbs, canonicals y sitemap para productos y categorías.

Las imágenes y los identificadores originales `prod_*` de estos controles todavía no fueron recuperados de forma verificable; no se publican sustitutos engañosos.

## Comandos

```bash
npm install --package-lock=false --no-audit --no-fund
npm run dev
npm run crawl:original -- --output .migration-work/hostinger-public
npm run import:original -- --source .migration-work/hostinger-public/html
npm run validate:content
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

El crawler limita dominio, concurrencia, reintentos, timeout y cantidad de páginas. La caché de HTML se guarda bajo `.migration-work/` y no debe versionarse. El importador admite varios archivos o directorios, registra SHA-256 y errores por isla, preserva tipos Astro desconocidos y genera salida ordenada.

## Rutas principales

- `/`
- `/nosotros/`
- `/tienda/`
- `/blog/`
- `/recetas/`
- `/guayaba/`
- `/melena-de-leon-futuro-fungi-50ml/`
- `/tienda/categoria/hierbas-medicinales/`
- `/tienda/categoria/suplementos/`
- `/chocolate-casero/`
- `/receta-barra-de-cereal/`
- `/terms-and-conditions/`

Se conservan redirecciones permanentes para `/inicio/` y `/terminos-condiciones/`. `/category/uncategorized/` permanece como ruta `noindex`.

## Seguridad

No se versionan `.env`, SQL, `wp-config.php`, usuarios, contraseñas, salts, tokens, sesiones, plugins, temas, cachés ni el árbol WordPress. La auditoría del respaldo solo registra hashes, conteos, estructura y datos públicos necesarios para la migración.

## Documentación

- [Estado de migración](docs/MIGRATION-STATUS.md)
- [Recuperación Hostinger y WordPress](docs/HOSTINGER-RECOVERY.md)
- [Matriz de fidelidad](docs/fidelity/MATRIX.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [GitHub Actions](docs/GITHUB-ACTIONS.md)
- [Pruebas](docs/TEST-REPORT.md)
- [Rollback](docs/ROLLBACK.md)
