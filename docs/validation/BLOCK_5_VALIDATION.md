# Validación del BLOQUE 5

## Estado

Candidata v2 preparada. Validación ejecutable y revisión visual pendientes.

## Base esperada

La candidata debe aplicarse sobre el commit documental que registra su identidad exacta.

## Archivos candidatos

- `docs/design/BLOCK_5_NAVIGATION_SECURITY.md`;
- `docs/validation/BLOCK_5_VALIDATION.md`;
- `package.json`;
- `public/_headers`;
- `scripts/verify-security.mjs`;
- `src/App.test.tsx`;
- `src/App.tsx`;
- `src/catalog/CatalogSection.tsx`;
- `src/content/site-content.ts`;
- `src/main.tsx`;
- `src/pages/ApproachPage.tsx`;
- `src/pages/CatalogPage.tsx`;
- `src/pages/HomePage.tsx`;
- `src/pages/NotFoundPage.tsx`;
- `src/pages/PrivacyPage.tsx`;
- `src/routing.css`;
- `src/routing/AppLink.tsx`;
- `src/routing/routes.test.ts`;
- `src/routing/routes.ts`;
- `src/routing/useBrowserRoute.ts`;
- `tests/e2e/app.spec.ts`.

## Controles cubiertos

- rutas conocidas;
- normalización de rutas;
- 404;
- navegación cliente;
- atrás y adelante;
- navegación directa;
- enlaces internos reales;
- ruta activa;
- metadatos;
- foco;
- un `h1` por vista;
- privacidad;
- catálogo vacío;
- contacto ausente;
- ausencia de peticiones externas;
- encabezados de Cloudflare Pages;
- CSP;
- secretos;
- activos autorizados;
- fallback SPA;
- inspección de `dist`;
- ausencia de source maps;
- ausencia de funcionalidad excluida.

## Validación ejecutable requerida

1. comprobar la base remota;
2. comprobar SHA-256 y lista del candidato;
3. aplicar el candidato en una exportación limpia;
4. ejecutar `npm ci`;
5. instalar Chromium;
6. ejecutar `npm run verify`;
7. ejecutar `npm run verify:security`;
8. ejecutar `git diff --check`;
9. revisar capturas de inicio, privacidad, 404 y móvil;
10. confirmar que el catálogo permanezca vacío y el contacto permanezca ausente.

La candidata no debe publicarse hasta obtener un resultado `SUCCESS`.
