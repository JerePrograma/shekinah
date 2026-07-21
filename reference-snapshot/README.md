# Snapshot WordPress de referencia

Esta carpeta recibe la captura estática generada desde el WordPress restaurado localmente.

Hasta que exista `site/index.html`, la compilación conserva como respaldo transitorio el sitio Astro anterior. Después de ejecutar `scripts/Migrate-WordPressReference.ps1`, `npm run build` publica el contenido capturado de esta carpeta.

Se versionan únicamente datos y recursos públicos:

- HTML renderizado;
- imágenes y medios públicos;
- CSS, JavaScript y fuentes necesarios;
- rutas y redirecciones públicas;
- inventarios sanitizados de contenido, temas y plugins;
- manifiesto SHA-256;
- capturas de referencia.

No deben entrar aquí:

- base SQL completa;
- `wp-config.php`;
- usuarios o metadatos de usuarios;
- contraseñas, salts, tokens o claves;
- datos administrativos o privados;
- logs del servidor.
