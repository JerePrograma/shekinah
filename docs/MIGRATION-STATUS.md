# Estado de migración

Fecha de actualización: **2026-07-21**.

Estado técnico: **migración implementada, reproducible y unificada en `main`**.

Estado operativo: **código listo; CI y publicación final pendientes de ejecución y verificación sobre el HEAD consolidado**.

## Resumen ejecutivo

- Repositorio: `JerePrograma/shekinah`.
- Rama operativa y de producción: `main`.
- Pull requests e issues abiertos detectados: ninguno.
- Trabajo pendiente identificado fuera de `main`: ninguno mediante PR.
- Proyecto de destino: Cloudflare Pages `shekinah`.
- Dominio estable asignado: `https://shekinah-7dl.pages.dev`.
- Publicador canónico: GitHub Actions mediante `wrangler pages deploy`.
- Una integración Git o un Worker de Cloudflare conectado automáticamente al repositorio debe quedar deshabilitado para evitar despliegues duplicados o ejecutar `npx wrangler deploy` sobre un proyecto que no es Worker.

## Alcance finalizado

- Inspección, tipo real, tamaño y SHA-256 de los cuatro adjuntos.
- Validación segura del ZIP: sin path traversal, entradas cifradas, duplicados ni archivos dañados detectados.
- Comparación de los dumps SQL, el WXR y los archivos recuperados.
- Identificación de 21 tablas con prefijo `wp_`, sin ejecutar SQL ni PHP.
- Scripts reproducibles de inspección, extracción, saneamiento y mapeo de medios.
- Proyecto Astro 7 estático con TypeScript estricto y Content Collections.
- Migración de 8 páginas o rutas canónicas, 2 entradas y 2 recetas.
- Selección y optimización de 5 medios esenciales; el resto quedó inventariado y justificado.
- Diseño mobile first, responsive, semántico y accesible con CSS propio.
- SEO, sitemap, robots, manifest, 404, canonical, Open Graph y datos estructurados.
- Pruebas unitarias, Playwright y auditorías de salida y secretos.
- `package-lock.json` reproducible publicado; `npm ci` ya no depende de los adjuntos.
- Verificación integral anterior aprobada en GitHub Actions con Node.js 24, npm 11 y Chromium.
- Registro de 45 pruebas Playwright aprobadas en la ejecución remota más reciente documentada.
- CI, Dependabot y workflow de despliegue Cloudflare Pages configurados.
- Documentación de arquitectura, contenido, seguridad, pruebas, mantenimiento, despliegue y rollback.
- URL de producción aplicada a Astro, robots, CI y workflow de despliegue.
- Script `npm run deploy` configurado para publicar `dist` en el proyecto `shekinah`, rama `main`.
- Workflow de producción configurado para desplegar el mismo SHA que aprobó CI.
- Automatizaciones temporales de formato eliminadas del estado final.

## Verificación de la consolidación actual

La última suite completa registrada corresponde a un commit anterior y demostró que la aplicación, pruebas y auditorías eran funcionales. Los cambios posteriores afectan principalmente documentación y automatización de despliegue.

El HEAD consolidado no se declara aprobado hasta completar un nuevo run de:

```bash
npm ci
npm run verify
```

y confirmar el workflow **CI** en verde. Esta distinción es deliberada: historial aprobado no equivale a validación automática de cambios nuevos.

## Estado por área

| Área                     | Estado                          | Evidencia o siguiente control                                |
| ------------------------ | ------------------------------- | ------------------------------------------------------------ |
| Evidencia original       | Finalizada                      | Inventarios redactados; originales excluidos del repositorio |
| Extracción y saneamiento | Finalizada                      | `scripts/migration/` y pruebas unitarias                     |
| Aplicación Astro         | Finalizada                      | Build estático sin backend ni base de datos                  |
| Contenido y rutas        | Finalizada                      | Inventarios y pruebas de rutas                               |
| Medios                   | Finalizada con selección curada | 5 medios de producción; faltantes documentados               |
| Seguridad                | Finalizada                      | Auditoría de secretos y exclusión de backups                 |
| Reproducibilidad         | Finalizada                      | `package-lock.json`, Node.js 24 y `npm ci`                   |
| Validación histórica     | Aprobada                        | `docs/CI-VERIFICATION.md`                                    |
| Consolidación en `main`  | Finalizada                      | Sin PR ni issues abiertos                                    |
| CI del HEAD actual       | Pendiente operativo             | Ejecutar CI y corregir cualquier control rojo                |
| Cloudflare Pages         | Pendiente externo               | Configurar secretos y desactivar publicadores paralelos      |
| Verificación pública     | Pendiente externo               | Abrir rutas y comprobar el SHA desplegado                    |

## Decisiones definitivas

1. El proyecto permanece completamente estático.
2. No se reinstala ni se ejecuta WordPress.
3. No se incorpora PHP, base de datos, SSR, Express, Docker ni infraestructura persistente.
4. `main` es la única rama operativa y de producción.
5. GitHub Actions valida y publica el mismo SHA en Cloudflare Pages.
6. No se mantiene una segunda publicación automática desde Cloudflare Git Integration o Workers Builds.
7. No se publican backups, SQL, WXR, ZIP, credenciales ni material fuente sensible.
8. No se inventa contenido faltante para aparentar una recuperación más completa.

## Tareas pendientes obligatorias

1. Confirmar en Cloudflare que el destino es un proyecto **Pages** llamado `shekinah`.
2. Deshabilitar deployments automáticos de cualquier integración Git de Cloudflare conectada al repositorio.
3. Si existe un recurso **Worker** con `Deploy command = npx wrangler deploy`, desconectarlo o eliminarlo después de confirmar que no contiene otro servicio válido.
4. Crear un API Token de Cloudflare limitado a la cuenta y con permiso de edición de Pages.
5. Obtener el `CLOUDFLARE_ACCOUNT_ID` de la cuenta correcta.
6. Crear en GitHub Actions los secretos:

   ```text
   CLOUDFLARE_API_TOKEN
   CLOUDFLARE_ACCOUNT_ID
   ```

7. Ejecutar **Actions → CI → Run workflow** sobre `main`.
8. Corregir cualquier error hasta obtener CI verde.
9. Confirmar que **Deploy Cloudflare Pages** se ejecuta después de CI o iniciarlo manualmente.
10. Abrir `https://shekinah-7dl.pages.dev`.
11. Verificar portada, navegación, imágenes, rutas, 404, `robots.txt` y `sitemap-index.xml`.
12. Comparar el SHA desplegado en Cloudflare con el SHA validado por CI.

## Tareas opcionales posteriores

- Asociar un dominio propio y actualizar `SITE_URL`, Astro, robots y workflows en el mismo commit.
- Agregar contenido editorial nuevo siguiendo `docs/MAINTENANCE.md`.
- Ejecutar una revisión visual humana en dispositivos reales después del primer despliegue válido.
- Habilitar Cloudflare Web Analytics si se desea medición sin incorporar un backend propio.

## Fuera de alcance deliberadamente

- Recuperar funcionalidades de administración de WordPress.
- WooCommerce o pagos.
- Formularios con almacenamiento persistente.
- Inventar productos, precios, recetas o datos de contacto no demostrados.
- Depender de Hostinger, PHP, MariaDB, WP-CLI, localhost, Docker o una computadora del usuario para producción.

Ninguna tarea pendiente exige volver a acceder a los cuatro adjuntos ni reconstruir el entorno WordPress.
