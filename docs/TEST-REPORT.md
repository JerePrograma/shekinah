# Informe de pruebas

Fecha de actualización: **2026-07-22**.

## Cobertura implementada

### Análisis estático

- TypeScript estricto mediante `tsc --noEmit` dentro del build.
- ESLint para TypeScript, TSX, JavaScript, scripts y pruebas.
- Verificación determinista de LF, espacios finales y salto de línea final.

### Build y SEO

- Build cliente Vite.
- Build SSR temporal.
- Prerender de rutas canónicas y 404.
- Títulos, descripciones, canonical, Open Graph, Twitter Cards y JSON-LD.
- Sitemap, robots y redirecciones.

### Pruebas unitarias

- React y Vite como arquitectura productiva.
- Ausencia del snapshot y del código Astro anterior.
- Rutas y contenido declarados en TypeScript.
- HTML prerenderizado con SEO y sin marcadores WordPress.

### Pruebas E2E

- Rutas principales en 375×812, 768×1024 y 1440×1200.
- Un único `h1`, `main` visible y canonical correcto.
- Consola y errores de página vacíos.
- Menú móvil y estado `aria-expanded`.
- Documento 404 y `noindex`.

### Auditorías

- Límite de archivos y tamaño de Cloudflare Pages.
- Recursos y enlaces internos rotos.
- Sourcemaps y archivos prohibidos.
- Endpoints WordPress activos.
- Patrones de secretos y configuraciones privadas.

## Estado de ejecución

La modificación fue construida mediante el conector remoto de GitHub porque el entorno efímero no pudo resolver GitHub por DNS. Por eso no se declara una ejecución local. El resultado verificable es el estado de GitHub Actions asociado al commit publicado; cualquier fallo debe conservarse como evidencia y corregirse antes de considerar el despliegue válido.
