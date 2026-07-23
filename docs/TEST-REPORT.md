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
- Publicación desde la raíz `/`.

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

### Publicación y producción

El workflow `Deploy Cloudflare Pages` valida además:

- reconstrucción del SHA aprobado por `CI`;
- consistencia de `dist/` antes de publicar;
- identificación del mismo SHA en el deployment canónico de Cloudflare;
- disponibilidad de las URLs de deployment, canónica y estable;
- rutas principales, productos, categorías y páginas editoriales;
- títulos, canonicals, sitemap y robots productivos;
- ausencia de frases técnicas, dominios anteriores e identificadores internos.

## Ejecución

`.github/workflows/ci.yml` bloquea la publicación ante cualquier fallo local. `.github/workflows/deploy-cloudflare.yml` solo se ejecuta tras un `CI` exitoso de `main` y publica exactamente el SHA que fue validado.
