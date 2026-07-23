# Informe de pruebas

Fecha de actualización: **2026-07-23**.

## Cobertura

### Análisis estático

- TypeScript estricto mediante `tsc --noEmit` dentro del build.
- ESLint para TypeScript, TSX, JavaScript, scripts y pruebas.
- Verificación de LF, espacios finales y salto de línea final.

### Build y SEO

- Build cliente Vite.
- Build SSR temporal.
- Prerender de rutas canónicas, redirecciones y 404.
- Títulos, descripciones, canonical, Open Graph, Twitter Cards y JSON-LD.
- Sitemap y robots con la URL final de GitHub Pages.
- Validación específica de la subruta `/shekinah/`.

### Pruebas unitarias

- Arquitectura React y Vite.
- Rutas y contenido declarados en TypeScript.
- HTML prerenderizado con SEO válido.
- Catálogo, productos y categorías consistentes.

### Pruebas de navegador

- Rutas principales en resoluciones móviles, tablet y escritorio.
- Un único `h1`, `main` visible y canonical correcto.
- Consola y errores de página vacíos.
- Menú móvil y estado `aria-expanded`.
- Documento 404 y `noindex`.

### Auditorías

- Cantidad y tamaño de archivos.
- Recursos y enlaces internos rotos.
- Sourcemaps y archivos prohibidos.
- Endpoints dinámicos no permitidos.
- Patrones de secretos y configuraciones privadas.
- Dependencias productivas con vulnerabilidades de severidad alta.

## Ejecución

El workflow `.github/workflows/ci.yml` bloquea el despliegue cuando falla cualquiera de estas verificaciones. El trabajo de publicación solo recibe el artefacto estático generado después de una validación completa.
