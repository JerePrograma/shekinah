# Estado de migración

Fecha de actualización: **2026-07-21**.

Estado técnico: **migración implementada, reproducible, probada y unificada en `main`**.

Estado operativo: **código listo; publicación pública pendiente de corregir y verificar en Cloudflare Pages**.

## Resumen ejecutivo

- Repositorio: `JerePrograma/shekinah`.
- Rama operativa y de producción: `main`.
- Pull requests abiertos detectados: ninguno.
- Trabajo pendiente identificado fuera de `main`: ninguno mediante PR.
- Proyecto Cloudflare existente: `shekinah`.
- Dominio estable asignado: `https://shekinah-7dl.pages.dev`.
- Integración Git de Cloudflare: conectada al repositorio y a `main`.
- Último build observado en Cloudflare: compilación Astro correcta; despliegue fallido por usar el comando de Workers `npx wrangler deploy`.
- Comando correcto para Pages: `npx wrangler pages deploy dist --project-name shekinah --branch main`.

## Alcance finalizado

- Inspección, tipo real, tamaño y SHA-256 de los cuatro adjuntos.
- Validación segura del ZIP: sin path traversal, entradas cifradas, duplicados ni archivos dañados detectados.
- Comparación de los dumps SQL, el WXR y los archivos recuperados.
- Identificación de 21 tablas con prefijo `wp_`, sin ejecutar SQL ni PHP.
- Scripts reproducibles de inspección, extracción, saneamiento y mapeo de medios.
- Proyecto Astro 7 estático con TypeScript estricto y Content Collections.
- Migración de 8 páginas/rutas canónicas, 2 entradas y 2 recetas.
- Selección y optimización de 5 medios esenciales; el resto quedó inventariado y justificado.
- Diseño mobile first, responsive, semántico y accesible con CSS propio.
- SEO, sitemap, robots, manifest, 404, canonical, Open Graph y datos estructurados.
- Pruebas unitarias, Playwright y auditorías de salida y secretos.
- `package-lock.json` reproducible publicado; `npm ci` ya no depende de los adjuntos.
- Verificación final aprobada en GitHub Actions con Node 24, npm 11 y Chromium.
- Registro de 45 pruebas Playwright aprobadas en la ejecución remota más reciente informada.
- CI, Dependabot y workflow manual de respaldo para Cloudflare Pages.
- Documentación de arquitectura, contenido, seguridad, pruebas, mantenimiento, despliegue y rollback.
- URL de producción aplicada a Astro, robots, CI y workflow de despliegue.
- Mecanismos de despliegue unificados: integración Git de Cloudflare como vía principal; GitHub Actions solo como respaldo manual.
- Script `npm run deploy` corregido para apuntar explícitamente a la rama de producción `main`.

## Estado por área

| Área | Estado | Evidencia o siguiente control |
| --- | --- | --- |
| Evidencia original | Finalizada | Inventarios redactados; originales excluidos del repositorio |
| Extracción y saneamiento | Finalizada | `scripts/migration/` y pruebas unitarias |
| Aplicación Astro | Finalizada | Build estático sin backend ni base de datos |
| Contenido y rutas | Finalizada | Inventarios y pruebas de rutas |
| Medios | Finalizada con selección curada | 5 medios de producción; faltantes documentados |
| Seguridad | Finalizada | Auditoría de secretos y exclusión de backups |
| Reproducibilidad | Finalizada | `package-lock.json`, Node 24 y `npm ci` |
| CI remoto | Finalizada | `docs/CI-VERIFICATION.md` |
| Consolidación en `main` | Finalizada | Sin PR abiertos; documentación y automatización actualizadas |
| Configuración de URL | Finalizada en código | `https://shekinah-7dl.pages.dev` aplicada |
| Cloudflare Pages | Bloqueo externo | Cambiar comando de deploy en el panel y reintentar |
| Verificación pública | Pendiente externo | Abrir rutas, robots, sitemap y comprobar SHA desplegado |

## Decisiones definitivas

1. El proyecto permanece completamente estático.
2. No se reinstala ni se ejecuta WordPress.
3. No se incorpora PHP, base de datos, SSR, Express, Docker ni infraestructura persistente.
4. `main` es la única rama operativa y de producción.
5. Cloudflare Pages con integración Git es el flujo normal de publicación.
6. `.github/workflows/deploy-cloudflare.yml` queda manual para recuperación o despliegue controlado, evitando duplicados.
7. No se publican backups, SQL, WXR, ZIP, credenciales ni material fuente sensible.
8. No se inventa contenido faltante para aparentar una recuperación más completa.

## Tareas pendientes obligatorias

Estas tareas se realizan en Cloudflare; no requieren cambios de código ni acceso a los adjuntos:

1. Abrir **Workers & Pages → shekinah → Settings → Build**.
2. Confirmar `Production branch = main`.
3. Confirmar `Build command = npm run build`.
4. reemplazar `npx wrangler deploy` por:

   ```bash
   npx wrangler pages deploy dist --project-name shekinah --branch main
   ```

5. Confirmar `Root directory = /`.
6. Crear o corregir la variable de build:

   ```text
   SITE_URL=https://shekinah-7dl.pages.dev
   ```

7. Guardar la configuración.
8. Ejecutar **Retry deployment** sobre el último build fallido o generar uno nuevo desde `main`.
9. Verificar que el build y el deploy terminen en verde.
10. Abrir `https://shekinah-7dl.pages.dev`.
11. Verificar portada, navegación, imágenes, rutas, 404, `robots.txt` y `sitemap-index.xml`.
12. Comparar el SHA desplegado en Cloudflare con el HEAD de `main`.

## Tareas opcionales posteriores

- Asociar un dominio propio y actualizar `SITE_URL`, Astro, robots y workflows en el mismo commit.
- Configurar los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` solo si se quiere habilitar el workflow manual de respaldo.
- Agregar contenido editorial nuevo siguiendo `docs/MAINTENANCE.md`.
- Ejecutar una revisión visual humana en dispositivos reales después del primer deploy válido.

## Fuera de alcance deliberadamente

- Recuperar funcionalidades de administración de WordPress.
- WooCommerce o pagos.
- Formularios con almacenamiento persistente.
- Inventar productos, precios, recetas o datos de contacto no demostrados.
- Depender de Hostinger, PHP, MariaDB, WP-CLI, localhost, Docker o una computadora del usuario para producción.

Ninguna tarea pendiente exige volver a acceder a los cuatro adjuntos ni reconstruir el entorno WordPress.
