# Activos autorizados

## Logo de Shekinah

- archivo: `public/assets/logo-shekinah.png`;
- MIME: `image/png`;
- dimensiones: 383 × 383 px;
- tamaño: 105443 bytes;
- modo original verificado: RGBA;
- SHA-256: `cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747`.

## Favicon de Shekinah

- archivo: `public/assets/favicon-shekinah.svg`;
- MIME: `image/svg+xml`;
- área vectorial: 64 × 64 mediante `viewBox="0 0 64 64"`;
- tamaño: 526 bytes;
- SHA-256: `d9851118d9a6c9d3f39324273a86800875561da4822c81e5692f2c5ddbe1ea97`.

Es una adaptación mínima autorizada del único logo institucional: conserva el círculo salvia, la hoja triple con nervaduras y la paleta oficial `#b6cab1`/`#5b873d`, y omite únicamente el texto que no resulta legible a 16 × 16 px. No contiene scripts, recursos externos, fuentes ni contenido activo. El navegador la carga desde una ruta first-party declarada en `index.html`; storefront y administración comparten el mismo documento.

## Imágenes del catálogo

Están autorizados los 484 binarios históricos exactos ubicados en `public/images/original/catalog/` y declarados individualmente en `catalog/catalog-assets.json`:

- 317 JPEG;
- 9 PNG;
- 158 WebP;
- 509 referencias desde productos;
- cero archivos huérfanos;
- cero referencias faltantes;
- un producto sin imagen: `Caldo sin sal en polvo`.

El manifiesto registra para cada archivo su ruta, SHA-256, extensión, tamaño, productos asociados y cantidad de referencias. Los binarios se copiaron sin recomprimir, redimensionar ni alterar.

`scripts/verify-assets.mjs` aplica una allowlist exacta compuesta por el logo, el favicon y el manifiesto. Falla ante cambios de hash o tamaño, firmas y extensiones incoherentes, contenido activo o externo en el favicon, archivos inesperados, huérfanos, referencias externas o faltantes.

## Imágenes administrativas candidatas

La autorización para imágenes cargadas por un administrador es separada del inventario versionado:

- formatos JPEG, PNG y WebP;
- máximo 4 MiB por objeto;
- Content-Type y magic bytes coherentes;
- key UUID generada por servidor;
- lectura mediante ruta first-party `/api/catalog-images/*`;
- escritura y eliminación únicamente con sesión administrativa válida;
- bucket existente `shekinah` en production y bucket aislado `shekinah-preview` en preview mediante `CATALOG_IMAGES`.

Estos objetos no se agregan al manifiesto Git de 484 binarios porque viven en R2 y se referencian desde la mutación D1. El cleanup sólo puede retirar un objeto administrado que ya no esté referenciado. Ninguna operación administrativa puede borrar los assets históricos versionados.

Estado externo: R2 está activo, ambos buckets conservan clase Standard/default y `publicR2DevEnabled=false`, y Pages tiene `CATALOG_IMAGES` separado por entorno. No existe lectura pública directa por `r2.dev`; los objetos comerciales sólo se sirven mediante la ruta first-party controlada por Pages. Esta verificación de infraestructura no acredita todavía una imagen administrativa persistida por el candidato: faltan commit, CI, deployment del SHA definitivo y smoke autenticado.

## Exclusiones

No están autorizados:

- imágenes remotas;
- el logo como reemplazo de productos sin imagen;
- fotografías, iconos, fuentes o videos no declarados;
- recursos generados, redibujados o descargados nuevamente fuera de una adaptación institucional expresamente autorizada y documentada;
- recursos institucionales legacy.

La incorporación de otro activo requiere autorización explícita, procedencia documentada y actualización deliberada del manifiesto y los verificadores.
