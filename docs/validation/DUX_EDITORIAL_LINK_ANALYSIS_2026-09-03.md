# Análisis read-only de vínculos editoriales Dux — 2026-09-03

## Objetivo

Separar la identidad comercial autoritativa de Dux de los datos editoriales
reutilizables del catálogo local antes de crear cualquier vínculo persistente.

Dux continúa siendo la única autoridad para existencia, nombre, precio, stock,
clasificación e identidad comercial. El catálogo local sólo puede aportar
imágenes y descripciones compatibles. Mercado Libre no participó porque el
mirror productivo D1 no contenía publicaciones.

## Evidencia de entrada

El análisis se ejecutó sobre artefactos read-only obtenidos desde producción:

- `matching-source.json`: SHA-256
  `bd418f6815ad4841967aaa667601ebe5380fc6af491968497a6a754931c169cb`;
- `catalog-matching-report.json`: SHA-256
  `788bd4d3506ea3d3c876f7966eb88ebdf6d90b88bfba9c77719b9091b5282f9a`.

Los artefactos completos no se incorporan al repositorio.

## Hallazgos del primer análisis

- 747 ítems habilitados en Dux;
- 513 productos locales;
- 679 códigos con inventario cuantificado;
- 68 códigos sin inventario cuantificado y sin precio público positivo;
- 74 vínculos 1:1 confirmados por mapping de inventario;
- 8 sugerencias fuzzy;
- 2 ambigüedades;
- 663 ítems clasificados como `dux_only`.

La cifra `dux_only` no era una medida fiable de inexistencia local. El primer
matcher incluía la presentación dentro de la similitud principal, por lo que
penalizaba nombres equivalentes cuando Dux expresaba `100GR` y el nombre local
no lo hacía, aun cuando la descripción local confirmara la misma presentación.

Además, una sugerencia para `HONGOS DE PINO 100GR` seleccionaba el ID local
`cola-de-pavo-futuro-fungi-50ml`. Ese registro local contiene nombre y contenido
de Hongos de Pino bajo una identidad incompatible, por lo que no puede
importarse automáticamente.

## Segundo análisis por campo

`scripts/analyze-dux-editorial-links.mjs` consume exclusivamente los dos
artefactos anteriores. No consulta proveedores ni ejecuta operaciones D1.

El algoritmo separa:

- mapping de identidad ya confirmado;
- equivalencia semántica exacta sin presentación;
- compatibilidad de presentación obtenida del nombre, campo `presentation` o
  una línea explícita `Fracción mínima`;
- descripción reutilizable sólo cuando no contradice la presentación Dux;
- imagen reutilizable aun cuando la presentación requiera revisión;
- candidatos fuzzy exclusivamente para revisión manual;
- duplicados locales por nombre semántico;
- calidad de precio e inventario del catálogo Dux.

Resultado sobre la evidencia indicada:

- 74 `confirmed_identity`;
- 61 `auto_full` adicionales;
- 135 vínculos auto-confirmables en total;
- 32 `review_full`;
- 174 `review_image`;
- 57 `review_fuzzy`;
- 31 `ambiguous`;
- 318 `no_candidate`;
- 26 grupos locales con nombre semántico duplicado;
- 8 conflictos internos de presentación local.

## Bloqueo independiente del matching

El corte público no debe continuar todavía:

- 68 ítems Dux tienen precio público ausente o cero;
- 87 ítems tienen precio público exactamente `1` o `2`, tratados como
  placeholders que requieren corrección o decisión explícita;
- sólo 592 ítems tienen precio público superior a esos placeholders;
- existen 155 bloqueos de calidad de precio en total.

No se establece un precio local ni se usa Mercado Libre como fallback. La
corrección debe realizarse en Dux o definirse expresamente una política de
exclusión autoritativa para productos sin precio comercial válido.

## Estado

- migración productiva `0015_dux_catalog_snapshot.sql`: no aplicada;
- snapshot público Dux: no creado;
- mappings persistentes nuevos: ninguno;
- modificaciones sobre productos locales: ninguna;
- llamadas a Mercado Libre: ninguna;
- escrituras de negocio durante el análisis: ninguna.

El próximo cambio de datos deberá crear un almacenamiento editorial separado
del mapping de inventario y cargar únicamente los 135 vínculos
auto-confirmables después de revisar el CSV generado. Los casos restantes
deben resolverse mediante una cola administrativa, con alcance por campo y sin
copiar nombre, precio, stock ni SKU desde el catálogo local.
