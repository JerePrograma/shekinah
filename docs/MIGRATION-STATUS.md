# Estado de migración

Fecha de actualización: **2026-07-22**.

## Resultado

La arquitectura de producción fue reemplazada por una aplicación React/TypeScript cuyo contenido está versionado en `src/content.ts`. El snapshot estático de WordPress y sus herramientas de captura dejaron de ser fuente de build, prueba o despliegue.

## Alcance completado

- React 19 y React DOM para renderizado e hidratación.
- TypeScript estricto y Vite.
- Prerender estático de todas las rutas públicas y del documento 404.
- HTML con título, descripción, canonical, Open Graph, Twitter Cards y JSON-LD.
- Navegación responsive con estado accesible.
- Contenido de Nosotros, Tienda, Blog, Recetas y Términos trasladado a TypeScript.
- Redirecciones permanentes para rutas históricas.
- Sitemap y robots generados en el build.
- CI y despliegue Cloudflare independientes de WordPress y de cualquier ruta local.
- Pruebas unitarias de arquitectura, E2E multi-viewport, auditoría de salida y auditoría de secretos.

## Fuente de verdad

```text
src/content.ts       contenido y rutas
src/App.tsx          estructura y componentes
src/seo.ts           metadatos y datos estructurados
src/styles.css       sistema visual responsive
public/              activos estáticos verificados
```

## Compatibilidad

Las URLs públicas recuperadas permanecen disponibles. `/inicio/` redirige a `/`; `/terminos-condiciones/` redirige a `/terms-and-conditions/`; `/category/uncategorized/` conserva una respuesta informativa `noindex`.

## Dependencias eliminadas del proceso productivo

- WordPress, PHP y plugins.
- MariaDB y dumps SQL.
- WP-CLI y Docker.
- Captura Playwright desde una instalación local.
- Snapshot HTML copiado como `dist`.
- Archivos o variables del equipo del usuario.

## Validación remota

GitHub Actions debe validar el commit exacto antes de que el workflow de Cloudflare pueda desplegarlo. La evidencia de ejecución corresponde al estado del workflow asociado al commit, no a afirmaciones manuales en este documento.
