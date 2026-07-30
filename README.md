# Shekinah

Catálogo comercial de hierbas, especias, alimentos y productos naturales construido como una SPA estática con React, TypeScript estricto y Vite.

## Funcionalidad

- 510 productos y 16 categorías;
- búsqueda por nombre, categoría, presentación, SKU y descripción corta;
- filtro por categoría;
- paginación de 24 productos;
- fichas individuales con carga diferida del detalle;
- soporte para productos sin imagen o sin descripción;
- política de privacidad y vista 404;
- navegación mediante History API con foco administrado;
- activos locales y cero conexiones remotas en ejecución.

El sitio no incorpora backend, autenticación, carrito, checkout, formularios, analítica ni rastreadores.

## Rutas

- `/`: inicio y acceso directo al catálogo;
- `/catalogo`: catálogo completo;
- `/privacidad`: política de privacidad;
- `/<slug>/`: ficha de producto;
- `/tienda/categoria/<slug>/`: categoría;
- cualquier otra dirección: vista 404 normal.

## Datos

La aplicación publica únicamente el modelo comercial necesario para el navegador. El índice público no contiene fechas internas, procedencia, IDs técnicos ni HTML de origen.

- `src/data/authorized-commercial-data.ts`: acceso tipado al catálogo;
- `src/catalog-data/categories.json`: categorías;
- `src/catalog-data/catalog-details.json`: detalles cargados de forma diferida;
- `catalog/internal/catalog-index.json`: insumo interno de integridad, fuera de `dist`;
- `config/catalog-index-plugin.ts`: genera el módulo público sin metadatos internos;
- `catalog/catalog-manifest.json`: métricas y hashes internos;
- `catalog/catalog-assets.json`: inventario exacto de imágenes.

## Desarrollo

Requisitos:

- Node.js `24.18.0`;
- npm `>=11.0.0`.

```bash
npm ci
npm run install:browsers
npm run dev
```

## Validación

```bash
npm run verify
npm run build:pages
git diff --check
git diff --cached --check
```

`npm run verify` ejecuta ESLint, TypeScript, Vitest, validadores de catálogo, activos, seguridad y automatización, build de producción y Playwright.

## Producción

Cloudflare Pages debe usar:

- repositorio: `JerePrograma/shekinah`;
- rama: `main`;
- comando: `npm run build:pages`;
- salida: `dist`;
- directorio raíz: raíz del repositorio;
- Node.js: `24.18.0`;
- dominio: `shekinah-7dl.pages.dev`.

La CSP mantiene `connect-src 'none'`, no admite `unsafe-inline` ni `unsafe-eval`, y limita scripts, estilos e imágenes al mismo origen.
