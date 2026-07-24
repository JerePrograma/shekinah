# Shekinah

Sitio estático de catálogo para Shekinah, implementado con React, TypeScript y Vite. La experiencia prioriza lectura clara, navegación simple, controles grandes y un flujo de consulta por WhatsApp.

## Arquitectura

- React 19 con TypeScript estricto.
- Vite para desarrollo y compilación.
- Prerender SSR para generar HTML estático por ruta.
- Catálogo y contenido público generados desde datos versionados.
- Carrito local persistido en `localStorage`.
- Consulta comercial mediante WhatsApp; el sitio no procesa pagos.
- Despliegue validado en Cloudflare Pages.

## Requisitos

- Node.js: versión indicada en `.nvmrc`.
- npm: versión compatible con `package.json`.

## Instalación

```bash
npm install --package-lock=false --no-audit --no-fund
```

## Desarrollo

```bash
npm run dev
```

El servidor local queda disponible en `http://127.0.0.1:4321`.

## Comandos principales

```bash
npm run typecheck
npm run lint
npm run format:check
npm run validate:content
npm run build
npm run test:unit
npm run test:e2e
npm run audit:output
npm run audit:copy
npm run audit:secrets
npm run verify
```

`npm run verify` ejecuta la validación completa utilizada por CI.

## Rutas públicas principales

- `/`
- `/tienda/`
- `/tienda/categoria/<slug>/`
- `/<slug-de-producto>/`
- `/nosotros/`
- `/contacto/`
- `/blog/`
- `/terms-and-conditions/`

Las direcciones públicas retiradas se redirigen de forma permanente a una página útil y no se incluyen en el sitemap.

## Accesibilidad y experiencia

El sistema visual utiliza:

- texto base legible;
- contraste alto;
- foco visible;
- controles táctiles de al menos 44 por 44 píxeles;
- navegación móvil con estado anunciado;
- etiquetas visibles en formularios;
- respeto por `prefers-reduced-motion`;
- diseño responsive desde 320 píxeles.

## Catálogo y contenido

Los archivos de `src/generated/` son la fuente versionada. Antes de cada build, `scripts/prepare-public-data.mjs` genera la proyección pública en `src/generated-public/`.

No se deben editar productos, precios, unidades, SKU ni categorías desde componentes visuales. Cualquier corrección de datos debe hacerse en la fuente correspondiente y validarse con `npm run validate:content`.

## Despliegue

La rama productiva es `main`. El workflow `CI` valida la aplicación y, solo después de un resultado exitoso, `Deploy Cloudflare Pages` publica el mismo commit en:

`https://shekinah-7dl.pages.dev`

No se debe publicar un commit distinto del validado ni usar force-push.
