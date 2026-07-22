# Estado de migración

Fecha de actualización: **2026-07-22**.

## Resultado local verificable

- WordPress restaurado: **disponible durante la captura**.
- Snapshot: **generado y verificado localmente**.
- Fuente local: http://localhost:8081.
- Fecha de captura: 2026-07-22 13:27:37 +00:00.
- Commit base: ebb2d25284aead867a5bc2c042cbbaecf6c89b46.
- Tag de rollback: pre-wordpress-reference-20260722-101709.
- Publicación, CI y Cloudflare: **pendientes hasta completar el flujo remoto**.

| Métrica                       |    Valor |
| ----------------------------- | -------: |
| Páginas                       |       14 |
| Redirecciones                 |        0 |
| Recursos                      |       68 |
| Recursos externos localizados |       26 |
| Imágenes                      |       29 |
| Archivos                      |       88 |
| Bytes                         | 87549644 |
| Formularios                   |       14 |
| Errores HTTP                  |        0 |
| Errores de consola            |        0 |
| Páginas no recuperables       |        0 |

La migración no se declara completa hasta obtener CI y deployment verdes para el mismo SHA y verificar https://shekinah-7dl.pages.dev.
