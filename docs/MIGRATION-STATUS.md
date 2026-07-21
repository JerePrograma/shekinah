# Estado de migración

Estado técnico: **migración implementada, reproducible y unificada en `main`; CI en verificación remota y despliegue pendiente de credenciales Cloudflare**.

## Alcance completado

- Inspección, tipo real, tamaño y SHA-256 de los cuatro adjuntos.
- Validación segura del ZIP: sin path traversal, entradas cifradas, duplicados ni archivos dañados detectados.
- Comparación de los dos dumps SQL, el WXR y los archivos recuperados.
- Identificación de 21 tablas con prefijo `wp_`, sin ejecutar SQL ni PHP.
- Scripts reproducibles de inspección, extracción, saneamiento y mapeo de medios.
- Proyecto Astro 7 estático con TypeScript estricto y Content Collections.
- Migración de 8 páginas/rutas canónicas, 2 entradas y 2 recetas.
- Selección y optimización de 5 medios esenciales; los demás quedaron inventariados y justificados.
- Diseño mobile first, responsive, semántico y accesible con CSS propio.
- SEO, sitemap, robots, manifest, 404, canonical, Open Graph y datos estructurados.
- Pruebas unitarias, Playwright y auditorías de salida/secretos.
- `package-lock.json` reproducible publicado; `npm ci` ya no depende de un bootstrap ni de los adjuntos.
- CI, Dependabot y despliegue Cloudflare Pages configurados.
- Documentación de arquitectura, contenido, seguridad, pruebas, mantenimiento, despliegue y rollback.
- Eliminación del workflow temporal usado una sola vez para generar el lockfile.

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
| CI remoto | En verificación | Revisar el run disparado por el último commit de `main` |
| Cloudflare Pages | Pendiente externo | Requiere dos secretos y proyecto `shekinah` |
| URL pública | Pendiente externo | No debe inventarse hasta verificar el despliegue |

## Tareas estrictamente pendientes

1. Confirmar que el último workflow **CI** finalice en verde en GitHub Actions.
2. Si falla, corregir el primer step rojo y volver a ejecutar mediante un commit normal a `main`.
3. Crear el proyecto Cloudflare Pages `shekinah` como **Direct Upload**.
4. Configurar los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.
5. Ejecutar o dejar que se dispare `Deploy Cloudflare Pages` después de CI.
6. Verificar la URL pública, actualizar el canonical si Cloudflare asigna otra URL y registrar el resultado en README y este documento.

Ninguna tarea pendiente requiere volver a acceder a los cuatro adjuntos, usar rutas locales, levantar WordPress, instalar PHP, Docker o una base de datos.
