# Inventario de contenido

Fuente primaria: SQL. Corroboración: WXR y, para medios, ZIP. El autor original se conserva internamente como ID 1; su identificador de acceso no se publica porque no es necesario para el sitio.

## Contenido público migrado

|  ID | Tipo original | Título                                                         | Slug original                                                   | Estado    | Fecha / modificación | Ruta final                 | Fuente               | Confianza | Observaciones                                                                       |
| --: | ------------- | -------------------------------------------------------------- | --------------------------------------------------------------- | --------- | -------------------- | -------------------------- | -------------------- | --------- | ----------------------------------------------------------------------------------- |
|  31 | página        | Inicio                                                         | `inicio`                                                        | publicado | 2026-07-20 13:58:48  | `/`                        | SQL + WXR + archivos | Alta      | Elegida como portada; `/inicio/` redirige a `/`                                     |
|  27 | página        | Nosotros                                                       | `nosotros`                                                      | publicado | 2026-07-20 13:58:48  | `/nosotros/`               | SQL + WXR + archivos | Alta      | HTML saneado y estructura rediseñada                                                |
|  26 | página        | Tienda                                                         | `tienda`                                                        | publicado | 2026-07-20 13:58:48  | `/tienda/`                 | SQL + WXR            | Media     | Página original vacía; catálogo derivado solo de productos mencionados en contenido |
|  29 | página        | Blog                                                           | `blog`                                                          | publicado | 2026-07-20 13:58:48  | `/blog/`                   | SQL + WXR            | Alta      | Índice generado desde colección `posts`                                             |
|  30 | página        | Recetas                                                        | `recetas`                                                       | publicado | 2026-07-20 13:58:48  | `/recetas/`                | SQL + WXR            | Alta      | Índice generado desde colección `recipes`                                           |
|  25 | página        | Términos y condiciones                                         | `terms-and-conditions`                                          | publicado | 2026-07-20 13:58:48  | `/terms-and-conditions/`   | SQL + WXR            | Alta      | Se retiraron referencias a funciones ya inexistentes                                |
|  32 | página        | Chocolate Casero                                               | `chocolate-casero`                                              | publicado | 2026-07-20 13:58:48  | `/chocolate-casero/`       | SQL + WXR + archivos | Alta      | Reclasificada como receta; ingredientes y pasos estructurados                       |
|  34 | página        | Receta Barra de Cereal                                         | `receta-barra-de-cereal`                                        | publicado | 2026-07-20 13:58:49  | `/receta-barra-de-cereal/` | SQL + WXR + archivos | Media     | Reclasificada como receta; fuente incompleta y señalizada                           |
|  28 | entrada       | El viaje de las especias: sabor y bienestar                    | `el-viaje-de-las-especias-sabor-y-bienestar`                    | publicado | 2026-05-07 15:00:00  | ruta homónima              | SQL + WXR + archivos | Alta      | Afirmaciones de salud moderadas y contextualizadas                                  |
|  33 | entrada       | El poder del romero: memoria milenaria y frescura en tu cocina | `el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina` | publicado | 2026-04-25 15:00:00  | ruta homónima              | SQL + WXR + archivos | Alta      | Afirmaciones de salud moderadas y contextualizadas                                  |

## Contenido no publicado como página autónoma

|  ID | Tipo       | Título               | Estado     | Tratamiento                              | Motivo                                                   |
| --: | ---------- | -------------------- | ---------- | ---------------------------------------- | -------------------------------------------------------- |
|   1 | entrada    | Hello world!         | publicado  | redirección a `/blog/`                   | Contenido de demostración estándar                       |
|   3 | página     | Privacy Policy       | borrador   | redirección temporal a términos          | Plantilla genérica no adaptada y nunca publicada         |
|   4 | navegación | Navigation           | publicado  | reemplazada por `src/data/navigation.ts` | Contenido técnico `wp_navigation`                        |
|  35 | página     | Terminos condiciones | publicado  | redirección a `/terms-and-conditions/`   | Plantilla genérica duplicada con marcadores y otra marca |
|  36 | entrada    | Borrador automático  | auto-draft | descartado                               | Registro técnico sin slug ni contenido público           |

## Adjuntos registrados

Los IDs 5 a 24 son 20 registros `attachment` con estado `inherit`. Todos tienen archivo físico localizado en el ZIP. Sus detalles y tratamiento están en `MEDIA-INVENTORY.md`.

## Taxonomías y menús

- Única categoría original: `Uncategorized`.
- No se detectaron etiquetas públicas útiles.
- Las dos entradas migradas se reclasificaron semánticamente como `Especias` y `Hierbas` para evitar conservar una taxonomía vacía de significado.
- El menú original era un bloque automático de listado de páginas. Se sustituyó por navegación explícita, estable y accesible.

## Enlaces y relaciones

- Los enlaces internos a `/blog`, `/tienda`, `/recetas`, `/chocolate-casero` y `/receta-barra-de-cereal` se normalizaron con barra final.
- No se conservan enlaces administrativos ni rutas PHP.
- No se publicó enlace a Mercado Libre porque la evidencia no proporciona un destino verificable.
- No se publicó WhatsApp porque no se encontró un número público verificable.
- El correo y domicilio del pie de página provienen de la página legal publicada.

## SEO recuperado

No se detectaron metadatos SEO específicos de un plugin. Los títulos, descripciones, imágenes sociales y datos estructurados se construyeron desde el contenido comprobado. No se inventaron redes sociales, horarios, teléfono, precios ni testimonios.
