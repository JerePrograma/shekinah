# Informe de seguridad

## Riesgos detectados en evidencia

- dumps con tabla de usuarios, hashes y sesiones;
- `wp-config.php` y configuración del servidor;
- plugins, tema y núcleo ejecutable;
- HTML recuperado con atributos y referencias externas;
- datos serializados y opciones técnicas.

## Controles aplicados

- evidencia leída sin ejecutar SQL o PHP;
- ZIP validado contra path traversal y cifrado;
- parser SQL de texto con lista blanca de opciones y metadatos;
- WXR reducido a campos de contenido necesarios;
- saneamiento de scripts, eventos, comentarios de bloques y rutas heredadas;
- `.gitignore` bloquea SQL, ZIP, backups, logs y `.env`;
- `audit-secrets.mjs` busca archivos prohibidos y patrones de secretos;
- `audit-output.mjs` inspecciona `dist`, referencias, sourcemaps y cadenas heredadas;
- GitHub Actions con `permissions: contents: read`;
- secretos de Cloudflare solo como GitHub Secrets;
- Dependabot semanal para npm.

## Dependencias

Las versiones están fijadas en `package-lock.json`. `npm audit` se ejecuta como informe en CI y no como sustituto del análisis: una alerta debe evaluarse por alcance, explotabilidad y presencia en producción.

## Datos públicos

El correo, CUIT y domicilio del pie/legal se consideran públicos porque estaban en la página legal publicada. No se expone el identificador de acceso del autor ni información de autenticación.

## Resultado

La auditoría local del repositorio no detectó secretos. La auditoría del build no detectó rutas heredadas, recursos externos activos ni archivos por encima del límite definido.
