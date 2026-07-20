# Informe de eliminación de plataforma heredada

## Descartado

- Todo el núcleo PHP.
- Tema `hostinger-ai-theme` y temas por defecto.
- Plugins de Hostinger, LiteSpeed y Action Scheduler asociados.
- configuración web, archivos privados y scripts de administración.
- SQL, WXR y ZIP originales.
- rutas de API, administración, login, comentarios y cron.

## Referencias activas eliminadas

El código de producción y `dist` se auditan contra:

- `hostinger`, `hostinger-ai`, `hostingersite`, `hpanel`;
- `litespeed`;
- `wordpress`, `wp-content`, `wp-admin`, `wp-includes`, `wp-json`;
- `localhost`;
- el dominio anterior;
- rutas `.php`.

La auditoría permite menciones únicamente dentro de documentación histórica y scripts de análisis. No se permite ninguna de esas cadenas en el build.

## Referencias históricas conservadas

La documentación usa nombres de plataforma para explicar la procedencia y los descartes. Los scripts de migración reconocen rutas heredadas para sanearlas. Esa presencia no se ejecuta ni se sirve al visitante.

## Resultado

- PHP en producción: **0 archivos**.
- base de datos: **ninguna**.
- backend obligatorio: **ninguno**.
- recursos cargados desde el dominio anterior: **0**.
- recursos externos cargados por páginas: **0**.

El resultado exacto de cada build se valida con `npm run audit:output`.
