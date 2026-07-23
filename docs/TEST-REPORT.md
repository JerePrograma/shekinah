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
- Sitemap y robots con la URL final de Cloudflare Pages.
- Validación de publicación desde la raíz `/`.

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
- Tienda, filtros, paginación, carrito y consulta por WhatsApp.

### Auditorías

- Cantidad y tamaño de archivos.
- Recursos y enlaces internos rotos.
- Sourcemaps y archivos prohibidos.
- Endpoints dinámicos no permitidos.
- Rastros técnicos, dominios anteriores e identificadores internos.
- Patrones de secretos y configuraciones privadas.
- Dependencias productivas con vulnerabilidades de severidad alta.

### Producción

El trabajo `verify-production` comprueba sobre `https://shekinah-7dl.pages.dev/`:

- disponibilidad después del deployment de Cloudflare;
- rutas principales, producto y categoría;
- títulos y canonicals productivos;
- ausencia de frases técnicas o dominios anteriores;
- `robots.txt` y `sitemap.xml`.

## Ejecución

El workflow `.github/workflows/ci.yml` marca el commit como fallido cuando no pasa una validación local. La publicación la realiza Cloudflare Pages desde `main`; GitHub Actions verifica después el resultado servido en producción.
