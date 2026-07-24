# Mapa de rutas

Este mapa describe las rutas públicas vigentes y las redirecciones permanentes generadas para Cloudflare Pages.

## Rutas canónicas vigentes

| Área | Ruta | Tipo | Resultado |
| --- | --- | --- | --- |
| Inicio | `/` | página | portada simplificada con acceso principal al catálogo |
| Nosotros | `/nosotros/` | página | presentación institucional |
| Productos | `/tienda/` | catálogo | búsqueda, categorías, paginación y acceso a detalles |
| Categoría | `/tienda/categoria/<slug>/` | catálogo filtrado | productos de la categoría seleccionada |
| Producto | `/<slug>/` | detalle comercial | información, cantidad, carrito y consulta |
| Contacto | `/contacto/` | página | WhatsApp, correo y ubicación confirmados |
| Guías y consejos | `/blog/` | índice | publicaciones informativas vigentes |
| Viaje de las especias | `/el-viaje-de-las-especias-sabor-y-bienestar/` | artículo | ruta canónica conservada |
| Poder del romero | `/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/` | artículo | ruta canónica conservada |
| Términos y condiciones | `/terms-and-conditions/` | página legal | ruta canónica conservada |
| Archivo sin categoría | `/category/uncategorized/` | compatibilidad | página con `noindex` y acceso a las guías vigentes |
| Ruta desconocida | `/404.html` | error | documento 404 estático personalizado |

Los productos y categorías se agregan al conjunto canónico desde los datos versionados. Todas las rutas finales usan barra final.

## Redirecciones permanentes

| Ruta anterior | Destino | Estado | Motivo |
| --- | --- | ---: | --- |
| `/inicio/` | `/` | 301 | evita duplicar la portada |
| `/terminos-condiciones/` | `/terms-and-conditions/` | 301 | unifica la página legal válida |
| `/recetas/` | `/tienda/` | 301 | funcionalidad retirada |
| `/chocolate-casero/` | `/tienda/` | 301 | contenido retirado |
| `/receta-barra-de-cereal/` | `/tienda/` | 301 | contenido retirado |

Las direcciones retiradas no se incluyen en `canonicalRoutes`, sitemap, navegación, datos editoriales ni SEO. Solo permanecen en el contrato de redirecciones y en pruebas que verifican su ausencia funcional.

## Implementación

Las redirecciones se declaran en `src/content.ts`. Durante `npm run build`, `scripts/prerender.mjs` genera:

- `dist/_redirects`, usado por Cloudflare Pages para responder con 301;
- un documento HTML de respaldo por dirección histórica, con `noindex, follow` y enlace al destino;
- `dist/sitemap.xml`, compuesto únicamente por rutas indexables vigentes;
- `dist/404.html`, para direcciones desconocidas.

El workflow `.github/workflows/deploy-cloudflare.yml` comprueba en producción:

- respuesta 301 de las direcciones retiradas;
- destino final `/tienda/`;
- ausencia de esas direcciones en sitemap;
- canonicals del dominio estable.

No se generan rutas PHP, administrativas, REST ni dependientes de WordPress o Astro.
