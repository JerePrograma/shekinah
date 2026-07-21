# Estado de migración

Fecha de actualización: **2026-07-21**.

## Resultado local

El snapshot real fue generado desde `http://localhost:8081` y aprobó todas las verificaciones locales. La publicación remota permanece pendiente al redactar este estado.

| Métrica                            |      Valor |
| ---------------------------------- | ---------: |
| Páginas                            |         14 |
| Redirecciones                      |          0 |
| Recursos                           |         68 |
| Recursos externos localizados      |         26 |
| Imágenes                           |         29 |
| Archivos del sitio                 |         88 |
| Bytes del sitio                    | 87.549.179 |
| Formularios visibles neutralizados |         14 |
| Errores HTTP                       |          0 |
| Errores de consola                 |          0 |
| Páginas no recuperables            |          0 |

- Fecha de captura UTC: `2026-07-21T18:32:42.553Z`.
- Commit base: `8deba8911da82b48b6c91a5c23cd49000b0c457a`.
- Tag de rollback: `pre-wordpress-reference-20260721-173405`.
- Fingerprint del respaldo: `607787bb1d30e42ad53eabe794f8b601eb602bca60bc6cff11c727318c67dfeb` (13.065 archivos, sin cambios).
- Fingerprint de la auditoría: `a8d45d85bce450f3ed27c09cf118923382f1bd212da9ea0039f0738971ba1860` (2 archivos, sin cambios).
- CI: pendiente del primer push del snapshot.
- Deployment: bloqueado hasta configurar los dos secretos Cloudflare requeridos.

La migración no se declara completa hasta obtener CI y deployment verdes para el mismo SHA y verificar `https://shekinah-7dl.pages.dev`.
