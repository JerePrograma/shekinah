# Inventario de contenido

Este documento distingue el contenido público vigente de las rutas históricas retiradas. La aplicación y los datos versionados del repositorio son la fuente de verdad operativa.

## Contenido público vigente

| Área | Ruta | Fuente actual | Estado | Observaciones |
| --- | --- | --- | --- | --- |
| Inicio | `/` | `src/App.tsx` y medios versionados | Pública | Portada simplificada con una acción principal hacia productos |
| Catálogo | `/tienda/` | `src/generated/products.json` y `src/generated/categories.json` | Pública | 510 productos y 16 categorías validados por script |
| Categorías | `/tienda/categoria/<slug>/` | Categorías versionadas | Públicas | Filtro directo del catálogo |
| Productos | `/<slug>/` | Productos versionados | Públicos | Detalle, cantidad, carrito y consulta por WhatsApp |
| Nosotros | `/nosotros/` | Contenido editorial versionado | Pública | Presentación institucional y medios propios |
| Contacto | `/contacto/` | Datos comerciales versionados | Pública | WhatsApp, correo y domicilio confirmados |
| Guías y consejos | `/blog/` | Entradas editoriales versionadas | Pública | Índice de artículos informativos |
| Viaje de las especias | `/el-viaje-de-las-especias-sabor-y-bienestar/` | Contenido editorial versionado | Pública | Artículo informativo |
| Poder del romero | `/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/` | Contenido editorial versionado | Pública | Artículo informativo |
| Términos y condiciones | `/terms-and-conditions/` | Contenido legal versionado | Pública | Información legal, cambios y reembolsos |
| Archivo sin categoría | `/category/uncategorized/` | Compatibilidad histórica | Pública con `noindex` | Enlaza hacia las guías actuales |

## Rutas históricas retiradas

Estas direcciones ya no generan páginas, contenido editorial, componentes, datos estructurados ni entradas de sitemap. Se conservan únicamente como redirecciones permanentes para evitar enlaces rotos.

| Contenido anterior | Ruta histórica | Tratamiento vigente |
| --- | --- | --- |
| Índice de recetas | `/recetas/` | Redirección 301 a `/tienda/` |
| Chocolate casero | `/chocolate-casero/` | Redirección 301 a `/tienda/` |
| Barra de cereal | `/receta-barra-de-cereal/` | Redirección 301 a `/tienda/` |

Los componentes, datos editoriales, pruebas visuales, estilos e imágenes exclusivos de estas páginas fueron retirados. Las menciones de ingredientes pertenecientes a productos permanecen intactas.

## Contenido no publicado como página autónoma

| Elemento histórico | Tratamiento | Motivo |
| --- | --- | --- |
| `Hello world!` | No publicado | Contenido de demostración estándar |
| `Privacy Policy` | No publicado | Borrador genérico nunca adaptado |
| Bloque `Navigation` | Sustituido por `src/content.ts` | Navegación automática no adecuada para la experiencia actual |
| Duplicado `Terminos condiciones` | Redirección a `/terms-and-conditions/` | Plantilla duplicada con marcadores incompletos |
| Borradores automáticos | Descartados | Registros técnicos sin contenido público |

## Catálogo

- Los 510 productos y 16 categorías permanecen versionados.
- No se modificaron nombres, precios, monedas, unidades, SKU, descripciones, slugs ni relaciones de categoría como parte del rediseño.
- La proyección pública se genera con `scripts/prepare-public-data.mjs`.
- `scripts/validate-catalog.mjs` controla integridad, rutas, relaciones y medios.
- El sitio no procesa pagos: el carrito prepara una consulta por WhatsApp para confirmar disponibilidad y precio final.

## Contacto comercial

- WhatsApp: `+54 9 223 621-6559`.
- Correo: `german.gauna@yahoo.com.ar`.
- Domicilio: Moreno 2575, Mar del Plata Norte (7600), Buenos Aires, Argentina.
- No se publican redes sociales, horarios o enlaces comerciales no confirmados.

## Taxonomías y navegación

- La navegación principal vigente contiene Inicio, Productos, Nosotros y Contacto.
- Guías y consejos se mantiene como contenido secundario accesible desde el pie de página.
- No existen menús profundos ni destinos funcionales basados en recetas.
- Las categorías del catálogo se derivan exclusivamente de los datos versionados.

## SEO y redirecciones

- Las rutas canónicas vigentes se prerenderizan como HTML estático.
- Productos y categorías conservan metadatos, canonicals, Open Graph y datos estructurados válidos.
- El sitemap excluye las rutas retiradas y el archivo sin categoría.
- `dist/_redirects` contiene las redirecciones 301 para Cloudflare Pages.
- Las páginas de redirección de respaldo usan `noindex, follow`.
