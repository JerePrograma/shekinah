# Snapshot WordPress de referencia

Esta carpeta es el destino del snapshot público generado desde la restauración WordPress local.

## Estado actual

Mientras no existan `site/index.html` y `manifest.json`, el snapshot no fue generado y el build de producción debe fallar. La aplicación Astro anterior no se usa como sustituto silencioso.

## Contenido versionable

- HTML renderizado;
- CSS y JavaScript frontend requeridos;
- fuentes, imágenes, fondos, `srcset`, audio, video y documentos públicos usados;
- recursos externos localizados;
- redirecciones, robots, sitemap y 404;
- inventarios públicos sanitizados;
- capturas de referencia;
- manifiesto con tamaños y SHA-256.

## Exclusiones

- SQL y backups;
- `.env` y `wp-config.php`;
- PHP ejecutable;
- usuarios, hashes, correos privados, sesiones y tokens;
- salts y claves;
- logs y datos administrativos.

El archivo se reemplaza automáticamente con conteos reales al completar una captura válida.
