# Inventario de medios

## Resumen

- 20 adjuntos registrados en SQL/WXR.
- 20 adjuntos originales localizados en el ZIP.
- 98 archivos físicos al contar originales y tamaños derivados.
- 5 activos finales optimizados y versionados.
- 15 adjuntos originales recuperados pero no seleccionados para producción por duplicación, baja utilidad o falta de vínculo esencial.
- 6 grupos de duplicados o variantes equivalentes detectados por contenido o procedencia.
- Ningún archivo final supera 25 MiB; el máximo es 11.388 B.

## Mapa de adjuntos originales

|  ID | Archivo original principal                                            | Tipo | Estado final                                   |
| --: | --------------------------------------------------------------------- | ---- | ---------------------------------------------- |
|   5 | `generated-HLX9PXv1SDjM5JQz.png`                                      | PNG  | recuperado; no seleccionado, escena redundante |
|   6 | `generated-dMQQGWzAeTEHHPrC.png`                                      | PNG  | usado como `culinary-kitchen.webp`             |
|   7 | `generated-jPSm9suFN5r0oZ20.png`                                      | PNG  | recuperado; no seleccionado, escena redundante |
|   8 | `generated-OMW30GwSHb8Scspx.png`                                      | PNG  | recuperado; no seleccionado, escena redundante |
|   9 | `generated-Wsl9bleNrh39ZNik.png`                                      | PNG  | recuperado; alternativa de mapa/especias       |
|  10 | `untitled-2DOwWMgtzthWRbby.jpg`                                       | JPEG | recuperado; insignia comercial parcial         |
|  11 | `unnamed-1-P3OgrX8M1mY2LGD2.webp`                                     | WebP | recuperado; no esencial para la reconstrucción |
|  12 | `generated-T804ng3N1LiSNGgb.png`                                      | PNG  | recuperado; escena de local genérica           |
|  13 | `untitled-tGKagdZZidMoS1Pn.png`                                       | PNG  | recuperado; duplicado visual de emblema        |
|  14 | `gemini_generated_image_d51h96d51h96d51h-P3N1xqg5N897ykUG-scaled.png` | PNG  | recuperado; emblema alternativo                |
|  15 | `untitled-a4YHsD3Wci0bRThO.jpg`                                       | JPEG | recuperado; insignia comercial parcial         |
|  16 | `1-lMXjDQCdLYx5it7L.png`                                              | PNG  | recuperado; duplicado de firma horizontal      |
|  17 | `gemini_generated_image_ipe86yipe86yipe8-K72q7zZFiByBALNL-scaled.png` | PNG  | usado como `about-spice-shop.webp`             |
|  18 | `gemini_generated_image_k1x2wzk1x2wzk1x2-jl25iWVmrwph1773-scaled.png` | PNG  | recuperado; variante visual no seleccionada    |
|  19 | `gemini_generated_image_k1x2wzk1x2wzk1x2-Y2hKRCOKPu2WYVxA-scaled.png` | PNG  | recuperado; variante casi duplicada del local  |
|  20 | `1-MXfW68aQ4s2UXJjG.png`                                              | PNG  | usado como `brand-horizontal.webp`             |
|  21 | `logo-ziMUAxVn3HFMH5zS.png`                                           | PNG  | usado como `brand-emblem.png`                  |
|  22 | `generated-Y15LhwVxcX9b4RuR.png`                                      | PNG  | recuperado; escena redundante                  |
|  23 | `generated-bY9wDNnLL9ezhBOF.png`                                      | PNG  | recuperado; escena redundante                  |
|  24 | `shekinah-uMNb3OOMGayev0mH-scaled.png`                                | PNG  | usado como `brand-lockup.webp`                 |

## Activos finales

| Ruta final                            | Dimensiones |  Bytes | SHA-256                                                            | Uso principal                                 |
| ------------------------------------- | ----------: | -----: | ------------------------------------------------------------------ | --------------------------------------------- |
| `public/images/about-spice-shop.webp` |     560×270 | 11.388 | `f5866fca2ec23200ea507f31055d01e07c8a3a5ce85c78b2c6c7be40f78049c5` | portada, Nosotros, Blog, artículos y catálogo |
| `public/images/brand-emblem.png`      |     128×126 |  8.323 | `925e23cc235dfbd7bd74ef33668009643ba7c5ad96757f749281d26a72410a24` | favicon y 404                                 |
| `public/images/brand-horizontal.webp` |     600×162 |  4.894 | `cb8631fc95b01f0cd4ad1019f96092bfec6b479bbbb3a810bfae132f17bd742b` | cabecera                                      |
| `public/images/brand-lockup.webp`     |     600×335 |  7.846 | `286ed059094d81dc76f31f5840db1942d72586846d2d3d691b3d654ccbe38009` | pie y Open Graph por defecto                  |
| `public/images/culinary-kitchen.webp` |     480×480 |  8.150 | `1622c8e82bf24820d7cec70c7df1a34d7c202eccfb2990d938ab81ae04af3334` | recetario, recetas y catálogo                 |

La selección limitada es deliberada: preserva identidad y evidencia visual útil sin versionar variantes repetidas o medios no vinculados de forma esencial. Los 20 originales siguen contabilizados como evidencia recuperada, pero los archivos fuente no se publican.

## Texto alternativo

Los adjuntos locales no tenían texto alternativo útil. El texto final se redactó a partir del contenido visual observado y evita afirmar personas, productos o ubicaciones no comprobables.

## Imágenes remotas

El HTML recuperado contenía 19 URLs de imágenes externas, principalmente de Unsplash y `assets.zyrosite.com`. No se cargan en producción. Se intentó verificarlas desde el entorno efímero, pero la resolución de red estaba restringida; se sustituyeron por archivos locales recuperados cuando existía equivalencia razonable. Véase `UNRESOLVED-ASSETS.md`.
