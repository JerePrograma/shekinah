# Informe de migración

## Resultado

Se transformó una instalación recuperada en un sitio Astro de generación estática. El resultado permanente está unificado en la rama `main` y el build depende únicamente del repositorio, Node.js y npm.

No se necesita volver a acceder a los cuatro adjuntos, ejecutar WordPress, PHP, MySQL/MariaDB, Docker, Hostinger, LiteSpeed ni un backend persistente.

## Evidencia analizada

- 2 dumps SQL de la misma base.
- 1 ZIP completo de archivos del sitio.
- 1 exportación WXR.

Los originales se trataron como evidencia de solo lectura y no se publicaron.

## Recuperación de contenido

- Registros publicados de página encontrados: **9**.
- Páginas/rutas canónicas materializadas: **8**; una duplicada se redirige.
- Entradas útiles migradas: **2**.
- Entrada de demostración descartada: **1**.
- Auto-borrador descartado: **1**.
- Recetas reclasificadas desde páginas: **2**.
- Página legal canónica: **1**.
- Borrador de privacidad genérico: no publicado.

## Recuperación de medios

- Adjuntos registrados: **20**.
- Adjuntos originales localizados: **20**.
- Archivos y variantes en uploads: **98**.
- Medios finales optimizados y seleccionados: **5**.
- Imágenes externas referenciadas: **19**; ninguna queda como dependencia activa.

La selección final evita duplicados, variantes innecesarias y archivos no vinculados al sitio materializado.

## Elementos descartados

- Núcleo, temas, plugins y archivos PHP.
- `wp-config.php`, `.htaccess`, logs y configuración privada.
- Base de datos y dumps originales.
- hashes de contraseña, sesiones, tokens y usuarios técnicos.
- metadatos Hostinger y LiteSpeed.
- comentarios de bloques y estilos inline inseguros.
- contenido de demostración, auto-drafts y plantilla legal duplicada.
- rutas administrativas y recursos del dominio anterior.
- formularios o destinatarios no suficientemente verificados.

## Decisiones técnicas

- Astro 7 estático, sin adaptador de servidor.
- Node 24 LTS en CI.
- npm y `package-lock.json` versionado para instalaciones deterministas.
- Contenido Markdown tipado con Content Collections.
- CSS propio; sin React, Tailwind o librería visual pesada.
- Tienda como catálogo informativo por ausencia de evidencia de comercio electrónico.
- Página Inicio como portada pese al ajuste heredado `show_on_front=posts`.
- Datos legales conservados solo cuando estaban en una página pública específica.
- Afirmaciones de bienestar editadas para no presentarlas como consejo médico.
- GitHub Actions como única canalización de validación y despliegue habitual.
- Cloudflare Pages Direct Upload mediante Wrangler para evitar depender de una computadora local.

## Diferencias visuales

Se preservan la paleta verde/dorada, el emblema, la firma, imágenes de especias, jerarquía editorial y tono de viaje/alquimia natural. La composición, navegación y responsive fueron rediseñados.

No se afirma una réplica pixel perfect porque no existe una captura integral del sitio original ni una referencia ejecutable autorizada.

## Calidad y seguridad

- TypeScript estricto.
- Astro check, ESLint y Prettier.
- pruebas unitarias de parsers y saneamiento.
- Playwright para rutas y vistas responsive.
- auditoría de `dist`.
- auditoría de secretos, backups y referencias prohibidas.
- Dependabot semanal.
- permisos mínimos en Actions.
- originales, SQL, credenciales y configuración sensible excluidos.

## Reproducibilidad

El lockfile fue generado contra el registro público de npm mediante un workflow efímero. Esto evitó versionar URLs internas del entorno de trabajo. Después de publicar `package-lock.json`, el workflow temporal fue eliminado.

El ciclo reproducible es:

```bash
npm ci
npm run check
npm run lint
npm run format:check
npm run build
npm run test
npm run audit:output
```

El build normal no lee ni busca los cuatro adjuntos.

## Confianza

| Área | Confianza |
| --- | --- |
| Contenido publicado | Alta |
| Rutas y slugs | Alta |
| Medios locales | Alta |
| Identidad de marca | Media-alta |
| Diseño exacto | Media |
| Catálogo, stock y precios | Baja; no recuperable |

## Estado final por alcance

### Finalizado

- inspección y comparación de evidencia;
- extracción segura;
- modelo de contenido;
- aplicación Astro;
- rutas y redirecciones;
- medios seleccionados;
- diseño responsive;
- SEO;
- seguridad;
- pruebas y auditorías;
- lockfile;
- CI y deploy configurados;
- documentación y rollback;
- unificación de todo el trabajo permanente en `main`.

### Pendiente externo

- confirmar el último CI remoto en verde;
- crear o verificar el proyecto Cloudflare Pages `shekinah`;
- configurar `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`;
- ejecutar el primer despliegue;
- verificar y registrar la URL pública definitiva.

Ninguna de estas tareas pendientes necesita los adjuntos originales ni componentes de la instalación heredada.
