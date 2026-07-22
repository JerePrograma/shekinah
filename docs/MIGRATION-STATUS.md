# Estado de migración

<!-- SHEKINAH-VERIFICATION:START -->

## Verificación más reciente de Shekinah

Fecha UTC: **2026-07-22T18:23:41Z**.

- Nombre público: **Shekinah**.
- Identificador técnico del repositorio: `JerePrograma/shekinah`.
- Fuente WordPress: `http://localhost:8081`.
- Snapshot generado: `07/22/2026 16:51:33`.
- Commit de contenido: `7a18900c1979dabb080c14d08091421b5d8a0206`.
- CI: **success**, run `29946184286`.
- Deployment Cloudflare Pages: **success**, run `29946314352`.
- Producción verificada: **https://shekinah-7dl.pages.dev**.

| Métrica                       |    Valor |
| ----------------------------- | -------: |
| Páginas                       |       12 |
| Redirecciones                 |        1 |
| Recursos                      |       67 |
| Recursos externos localizados |       26 |
| Imágenes                      |       29 |
| Archivos                      |       87 |
| Bytes                         | 87299318 |
| Formularios                   |        0 |
| Errores HTTP                  |        0 |
| Errores de consola            |        0 |
| Páginas no recuperables       |        0 |

La portada usa una página estática, muestra **Shekinah**, contiene navegación real y no conserva `Hello world!`, formularios inertes ni marcadores `trans-*` visibles.
<!-- SHEKINAH-VERIFICATION:END -->

Fecha de actualización: **2026-07-22**.

## Resultado: bloqueado en Cloudflare

- Fuente local: `http://localhost:8081` (`LOCAL_PORT=8081`).
- Fecha de captura: `2026-07-22T13:27:37.492Z`.
- Commit inicial de la ejecución publicada: `ebb2d25284aead867a5bc2c042cbbaecf6c89b46`.
- Commit del snapshot: `91761a6fdb64da05b54331524d11577ae3670032`.
- `origin/main` tras publicar el snapshot: `91761a6fdb64da05b54331524d11577ae3670032`.
- Tag histórico inmutable: `pre-wordpress-reference-20260721-173405` → `8deba8911da82b48b6c91a5c23cd49000b0c457a`.
- Tag publicado de la reejecución: `pre-wordpress-reference-20260722-101709` → `ebb2d25284aead867a5bc2c042cbbaecf6c89b46`.

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

## Evidencia local

- Node `24.18.0`; npm `11.16.0`; MariaDB `healthy`; WordPress y WP-CLI operativos.
- Unitarias: 7/7; E2E: 48/48; fidelidad: 42/42 con `maxDiffPixels: 0` y `threshold: 0`.
- Fingerprint del respaldo: `607787bb1d30e42ad53eabe794f8b601eb602bca60bc6cff11c727318c67dfeb` (13.065 archivos, sin cambios).
- Fingerprint de la auditoría: `a8d45d85bce450f3ed27c09cf118923382f1bd212da9ea0039f0738971ba1860` (2 archivos, sin cambios).

## Estado remoto

- CI del snapshot: **success**, run [29925014757](https://github.com/JerePrograma/shekinah/actions/runs/29925014757), SHA `91761a6fdb64da05b54331524d11577ae3670032`.
- Deployment: **failure**, run [29925142658](https://github.com/JerePrograma/shekinah/actions/runs/29925142658), mismo SHA.
- Primer paso bloqueante: `Require Cloudflare credentials`.
- Secretos ausentes a nivel repositorio y environment `cloudflare-pages-production`: `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.
- `Publish dist to Cloudflare Pages` y `Verify deployment and stable domain` no se ejecutaron.
- El dominio estable continúa sirviendo la versión previa; no existe evidencia de deployment del snapshot.
