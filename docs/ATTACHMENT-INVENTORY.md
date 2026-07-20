# Inventario de adjuntos

Fecha de inspección: **2026-07-20**. Los cuatro archivos se trataron como evidencia inmutable. No se modificaron ni se publicaron en el repositorio.

| Nombre exacto                                                          | MIME aparente     |               Formato |        Tamaño | SHA-256                                                            | Finalidad estimada                                                        | Confianza | Riesgo sensible                                           |
| ---------------------------------------------------------------------- | ----------------- | --------------------: | ------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------- | --------------------------------------------------------- |
| `u951590191_yCHGz.sql`                                                 | `application/sql` | dump phpMyAdmin/MySQL |     193.516 B | `2697c49c8cb6f52e260628e930a47d2dbe1ff231d4aefd2691acb4fb88143231` | Fuente primaria de estructura, opciones, contenido y relaciones           | Alta      | Sí: usuarios, hashes y sesiones                           |
| `127_0_0_1.sql`                                                        | `application/sql` | dump phpMyAdmin/MySQL |     193.647 B | `b76141633c2b476769d08ae4be963b631679db0e8c2360792cc35b20c34037d1` | Segunda copia de la misma base con sentencias de creación/selección de DB | Alta      | Sí: usuarios, hashes y sesiones                           |
| `public_html.zip`                                                      | `application/zip` |                   ZIP | 329.999.391 B | `4efd27eaa610819b440df7bc02411034ce5c3a4c1386b61a0eca25e6b67a5343` | Copia de archivos del sitio y fuente de medios                            | Alta      | Sí: `wp-config.php`, reglas de servidor y código heredado |
| `chocolate-chimpanzee-908881hostingersitecom.WordPress.2026-07-20.xml` | `application/xml` |               WXR 1.2 |     129.273 B | `3be08bdb42685cba0a8fc8421f539a7ead4769c0e314af5e133402f451f20733` | Exportación complementaria de páginas, entradas, términos y adjuntos      | Alta      | Moderado: identifica autor y dominio anterior             |

## Relación entre fuentes

Los SQL son la fuente primaria y contienen 21 tablas con prefijo `wp_`. El WXR corrobora 34 de los 35 registros de contenido detectados en SQL; el registro ausente es un auto-borrador técnico. El ZIP aporta los archivos físicos correspondientes a los 20 adjuntos registrados y variantes generadas por el sistema.

## Inspección segura del ZIP

- Entradas: **14.712**.
- Archivos: **13.061**.
- Directorios: **1.651**.
- Tamaño total declarado sin comprimir: **326.153.417 B**.
- Entradas cifradas: **0**.
- rutas absolutas o con `..`: **0**.
- nombres duplicados: **0**.
- enlaces simbólicos detectados: **0**.
- archivos dañados al verificar el ZIP: **0**.
- archivos dentro de `wp-content/uploads`: **98**, por **129.656.473 B**.

La extracción se restringió a un directorio efímero y no ejecutó PHP. Los archivos sensibles, núcleo, plugins y temas se descartaron después del análisis.

## Información técnica corroborada

- Generador WXR: WordPress **7.0.2**.
- Idioma: `es-AR`.
- Tema activo registrado: `hostinger-ai-theme`.
- Estructura de enlaces: `/%postname%/`.
- El ajuste original `show_on_front` era `posts`, sin página frontal asignada.

## Criterio de redacción

Los hashes se publican para identificar la evidencia, pero no se publican dumps, credenciales, salts, hashes de contraseña, tokens, configuraciones ni valores serializados de autenticación.
