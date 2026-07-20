# Mapa de rutas

| URL anterior                                                      | Ruta final               | Tipo            | Resultado                                       |
| ----------------------------------------------------------------- | ------------------------ | --------------- | ----------------------------------------------- |
| `/`                                                               | `/`                      | portada         | página Inicio reconstruida                      |
| `/inicio/`                                                        | `/`                      | redirección 301 | evita duplicar la portada                       |
| `/nosotros/`                                                      | `/nosotros/`             | página          | conservada                                      |
| `/tienda/`                                                        | `/tienda/`               | página          | catálogo informativo                            |
| `/blog/`                                                          | `/blog/`                 | índice          | generado desde posts                            |
| `/recetas/`                                                       | `/recetas/`              | índice          | generado desde recipes                          |
| `/chocolate-casero/`                                              | igual                    | receta          | conservada                                      |
| `/receta-barra-de-cereal/`                                        | igual                    | receta          | conservada con advertencia de contenido parcial |
| `/el-viaje-de-las-especias-sabor-y-bienestar/`                    | igual                    | entrada         | conservada                                      |
| `/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/` | igual                    | entrada         | conservada                                      |
| `/terms-and-conditions/`                                          | igual                    | legal           | ruta canónica                                   |
| `/terminos-condiciones/`                                          | `/terms-and-conditions/` | redirección 301 | elimina plantilla duplicada                     |
| `/privacy-policy/`                                                | `/terms-and-conditions/` | redirección 302 | el original era borrador genérico               |
| `/hello-world/`                                                   | `/blog/`                 | redirección 301 | elimina entrada de demostración                 |
| rutas desconocidas                                                | `/404.html`              | 404             | página estática personalizada                   |

## Decisión de portada

La opción `show_on_front` del SQL seguía configurada como `posts` y no tenía `page_on_front`. Sin embargo, la evidencia contiene una página pública `Inicio` con secciones, enlaces e imágenes. Se priorizó esa intención editorial y comercial para `/`. La discrepancia queda documentada y no se oculta.

## Implementación

Las redirecciones se mantienen en dos lugares deliberadamente:

- `astro.config.mjs`, para producir redirecciones durante preview y en hosts compatibles;
- `public/_redirects`, para Cloudflare Pages.

Todas las rutas finales usan barra final. No se generan rutas PHP, administrativas, REST ni de medios heredados.
