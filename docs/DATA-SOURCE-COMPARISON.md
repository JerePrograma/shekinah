# Comparación de fuentes

## SQL frente a SQL

Los dos dumps contienen el mismo conjunto de 21 tablas y el mismo contenido funcional. `127_0_0_1.sql` agrega instrucciones `CREATE DATABASE` y `USE`, además de diferencias de cabecera/fecha. La migración usa `u951590191_yCHGz.sql` como primaria por ser la copia más directa y toma la segunda como corroboración.

Tablas detectadas:

- núcleo: `wp_posts`, `wp_postmeta`, `wp_options`, `wp_users`, `wp_usermeta`, `wp_terms`, `wp_term_taxonomy`, `wp_term_relationships`, `wp_comments`, `wp_commentmeta`, `wp_links`;
- tareas: cuatro tablas de Action Scheduler;
- extensiones: tablas Hostinger Reach y LiteSpeed.

Las tablas de usuarios y metadatos de autenticación solo se inspeccionaron para identificar riesgo. No se extrajeron al contenido ni se publicaron.

## SQL frente a WXR

| Aspecto                | SQL |             WXR | Decisión                        |
| ---------------------- | --: | --------------: | ------------------------------- |
| registros de contenido |  35 |              34 | SQL primaria; WXR corrobora     |
| adjuntos               |  20 |              20 | coincidencia completa           |
| páginas                |  10 |              10 | coincidencia completa           |
| entradas               |   4 |               3 | WXR omite auto-draft ID 36      |
| navegación             |   1 |               1 | reemplazada por datos estáticos |
| opciones globales      |  sí |         parcial | SQL primaria                    |
| usuarios/autenticación |  sí | autor exportado | no publicar                     |
| metadatos de medios    |  sí |              sí | comparación y mapeo             |

## SQL/WXR frente al ZIP

Los 20 adjuntos tienen un archivo principal correspondiente en `wp-content/uploads`. El ZIP agrega tamaños derivados, archivos del núcleo, tema, plugins y configuración. Solo se conservaron imágenes efectivamente útiles.

## Diferencias significativas

1. El WXR declara WordPress 7.0.2 y exporta contenido, pero por diseño no es un backup completo.
2. El SQL demuestra que la portada no estaba formalmente asignada, aunque existe la página Inicio.
3. La página Tienda no contiene productos ni precios en SQL/WXR, y no aparecen tablas de WooCommerce.
4. La página `terminos-condiciones` es una plantilla genérica duplicada; `terms-and-conditions` contiene datos legales específicos y se toma como canónica.
5. El contenido visual mezcla imágenes locales y URLs remotas. La producción usa solo recursos locales recuperados.

## Confianza general

- Estructura y rutas: alta.
- Textos publicados: alta.
- Identidad visual: media-alta.
- Catálogo de productos: baja; no existe inventario recuperable.
- Réplica exacta de layout: media; no hay evidencia visual integral.
