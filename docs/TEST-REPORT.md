# Informe de pruebas

Fecha de actualización: **2026-07-21**.

## Estado actual

Las pruebas de la antigua implementación Astro constituyen una línea base histórica, no una validación del snapshot WordPress solicitado.

El snapshot real todavía no está versionado. En consecuencia, aún no existen resultados válidos para:

- integridad del manifiesto recuperado;
- rutas reales del WordPress;
- recursos reales;
- formularios reales;
- comparación visual contra la restauración;
- E2E del snapshot;
- build final de producción.

## Suite preparada

### Local contra WordPress

```text
npm run verify:snapshot:required
npm run build
npm run test:unit
npm run test:e2e
npm run audit:output
npm run audit:secrets
WORDPRESS_REFERENCE_URL=<URL_LOCAL> npm run test:fidelity
```

Viewports fijos:

```text
375 × 812
768 × 1024
1440 × 1200
```

La fidelidad exige `maxDiffPixels: 0` y `threshold: 0`.

### Cobertura estática

- rutas críticas y redirecciones reales;
- títulos y cuerpo visible;
- imágenes y `srcset` cargados;
- CSS y fuentes;
- navegación;
- recursos HTTP sin errores;
- consola sin errores;
- ausencia de conexiones externas no localizadas;
- ausencia de localhost y dominio Hostinger;
- canonical y `og:url`;
- robots, sitemap y 404;
- formularios clasificados y neutralizados.

## Resultado pendiente

Este archivo será reemplazado por el script maestro después de una ejecución local aprobada, con conteos reales del manifiesto. Después deberá actualizarse nuevamente con el run remoto y el SHA desplegado.
