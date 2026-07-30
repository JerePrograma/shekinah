# Procedencia

## Fuente histórica seleccionada

La fotografía comercial se recuperó exclusivamente del historial Git del mismo repositorio. La revisión definitiva es:

- commit: `7e39c5535800fdda31a48846f977fe5c1c05eb3f`;
- fecha del commit: 2026-07-26;
- relación: último commit anterior a `45af35eedfcc9fc4629b70fc5380cf0e70695d26`, que sustituyó el árbol legacy;
- fecha de captura comercial conservada: `2026-07-23`.

Se comparó esa revisión con `3304ff1f5548a90d9fa29d353df0eccc40ae3ca5` y `ee5cdf085c8d19f14bee9c6a11e5218ba0e3ab1a`. Productos, categorías e imágenes son idénticos; se eligió la revisión más reciente que mantiene las métricas validadas.

Objetos Git y controles de fuente:

- `src/generated/products.json`: blob `e224b0ff241547a038f53c84bb006ef7cf3e56bb`, SHA-256 `5b26bf5a44822646693fa3aaaf9530799da60115a7e3bcfb4bf8d09a1d9d137e`;
- `src/generated/categories.json`: blob `1649e6c27d92d1e26a45408c54bb8f499a023d64`, SHA-256 `4a2922171eee12d91f5b803469b8351a896b9b20423af034d8f3948ac7f1c25b`;
- `public/images/original/catalog/`: tree `9015d8a4ca17410c423ec50633d031f61695b385`;
- manifiesto histórico publicado: blob `a5225d4faf29c3b23adaa4d6393507f8e62a0c99` en `3304ff1f5548a90d9fa29d353df0eccc40ae3ca5`.

## Métricas recuperadas

- productos: 510;
- IDs, slugs y paths históricos únicos: 510 de cada uno;
- categorías: 16;
- precios ARS: 510;
- descripciones completas: 495;
- SKU: 432;
- referencias de imagen: 509;
- imágenes únicas: 484;
- imágenes fallidas o faltantes: 0;
- producto sin imagen: `Caldo sin sal en polvo`;
- productos sin descripción completa: 15.

Las variantes históricas contenían una entrada por producto que repetía sin diferencias comerciales el precio, SKU, disponibilidad y presentación del producto padre. El dataset público conserva cero variantes significativas porque no existe ninguna diferenciada en la fuente.

## Capas y sanitización

La recuperación mantiene tres capas separadas:

1. fuente histórica completa, materializada solo en un directorio temporal y nunca incluida en `dist`;
2. datos públicos sanitizados y versionados en `src/catalog-data/`;
3. manifiestos de validación en `catalog/`.

`scripts/prepare-catalog-data.mjs` valida los objetos Git, SHA-256, métricas, relaciones, rutas e imágenes; normaliza texto y entidades; elimina HTML, URLs y caracteres de control; reemplaza IDs internos por slugs; omite campos ausentes y genera resultados deterministas.

El script no descarga datos ni se ejecuta durante el build de Cloudflare. Para regenerar es necesario extraer explícitamente la fuente histórica y ejecutar:

```bash
node scripts/prepare-catalog-data.mjs <directorio-historico-extraido>
```

## Información excluida de producción

No forman parte del código o bundle público el Store ID, endpoints o CDN originales, hashes de páginas de API, IDs `prod_*`, `variant_*` o `pcol_*`, `originalUrl`, `evidence`, `descriptionHtml` ni advertencias técnicas internas.

El contacto continúa ausente. No se incorporaron datos comerciales inventados ni se restauró código, diseño, checkout, carrito, backend o automatización legacy.

## Manifiestos finales

- `catalog/catalog-manifest.json`: commit y objetos de origen, fecha, métricas, faltantes y hashes de outputs;
- `catalog/catalog-assets.json`: path, SHA-256, extensión, tamaño, productos y cantidad de referencias de cada imagen.

Ambos manifiestos quedan fuera del bundle público y son validados en cada `npm run verify`.

El logo actual conserva el activo previamente autorizado `public/assets/logo-shekinah.png`, con SHA-256 `cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747`; no proviene del catálogo histórico recuperado.
