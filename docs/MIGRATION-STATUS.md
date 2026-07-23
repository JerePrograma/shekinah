# Estado de migración

Fecha de actualización: **2026-07-23**.

## Resultado

La aplicación React/TypeScript es la fuente productiva y contiene el inventario público completo recuperado desde Hostinger Ecommerce, junto con el contenido editorial extraído de la copia WordPress original.

Se recuperaron y versionaron:

- **510 productos únicos** con ID original `prod_*` y slug único.
- **16 categorías o colecciones originales**.
- **510 precios públicos en ARS** con fecha de captura.
- **432 SKU**.
- **509 referencias de imagen** descargadas y verificadas.
- **484 binarios de imagen únicos**, deduplicados mediante SHA-256.
- Variantes, disponibilidad pública, unidades o fracciones detectables y procedencia por página de API.
- **9 entradas editoriales comerciales** desde el WXR original.
- **20 adjuntos originales** y sus relaciones documentadas.
- Páginas institucionales, artículos, recetas y términos completos recuperables.

El carrito local, las cantidades, la persistencia, el subtotal y el pedido por WhatsApp se mantienen como flujo comercial explícito. No se simula ni declara recuperado el checkout privado de Hostinger.

## Fuentes de verdad

```text
src/generated/products.json                    510 productos normalizados
src/generated/categories.json                  16 categorías normalizadas
src/generated/site.json                        configuración comercial pública
src/generated/wordpress-original-content.json  contenido editorial consumido por React
src/content.ts                                  contratos, navegación y rutas editoriales
src/catalog.ts                                  contratos tipados del catálogo
src/siteApp.tsx                                 aplicación, páginas y rutas públicas
src/storePages.tsx                              tienda, categorías y productos
src/cart.tsx                                    carrito local y pedido por WhatsApp
docs/fidelity/catalog-manifest.json             métricas y faltantes del catálogo
docs/fidelity/wordpress-original-manifest.json  procedencia WordPress completa
scripts/recover-hostinger-catalog.mjs            recuperación reproducible del catálogo
scripts/restore-wordpress-original.mjs           restauración editorial reproducible
```

## Extracción WordPress original

Archivo inspeccionado: `shekinah.orig.rar`.

- Tamaño: `515235795` bytes.
- SHA-256: `8776c2e6da17a229405e6881ed407760a3c4db3c746b5f67c8c190010013b336`.
- Formato: RAR5.
- Entradas: `14717`.
- Tamaño descomprimido: `656669244` bytes.
- Incluye el árbol WordPress original, `public_html.zip`, dos exportaciones SQL y una exportación WXR.
- El WXR contiene 34 elementos: 20 adjuntos, 9 páginas publicadas, 3 entradas publicadas, una política de privacidad de ejemplo en borrador y una navegación.
- WordPress no contiene productos WooCommerce ni registros equivalentes al inventario Hostinger.
- No se encontraron coincidencias de los IDs o productos faltantes dentro de SQL, WXR, archivos o medios originales.

La procedencia histórica completa se conserva en documentación. Los hostnames internos, configuraciones, SQL, PHP, credenciales y datos privados no se cargan en el bundle ni se publican en `dist`.

## Catálogo recuperado

La fuente comercial es el API público original asociado a:

```text
store_01KPB411FQRYAKN8ED2BSRBPZC
```

El catálogo fue recuperado en 26 páginas de API, con offsets `0` a `500`. El generador exige exactamente 510 IDs y slugs únicos, valida cada imagen por MIME y firma binaria, registra hashes de evidencia y bloquea la publicación ante inconsistencias.

La tienda implementa:

- búsqueda por nombre, SKU, descripción y categoría;
- filtros sobre las 16 categorías;
- paginación de 24 productos;
- rutas individuales prerenderizadas;
- rutas de categoría;
- carrito accesible y persistente;
- Product, Breadcrumb y Collection JSON-LD;
- canonical, Open Graph, sitemap y 404 estático.

## Contenido editorial restaurado

Se restauraron desde la fuente original:

- `/nosotros/`
- `/el-viaje-de-las-especias-sabor-y-bienestar/`
- `/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/`
- `/chocolate-casero/`
- `/receta-barra-de-cereal/`
- `/terms-and-conditions/`
- `/tienda/`
- `/blog/`
- `/recetas/`

La restauración conserva bloques, listas, fechas, IDs, hashes y relaciones de adjuntos. Se excluyen explícitamente contenido de ejemplo, borradores y navegación técnica que no forman parte del sitio comercial final.

## Faltantes comprobados en todas las fuentes disponibles

Estos faltantes no pueden completarse sin una fuente externa adicional y no deben rellenarse con contenido inventado:

- **15 productos** no tienen descripción original completa utilizable.
- **1 producto**, `Caldo sin sal en polvo`, no tiene imagen pública ni archivo equivalente en WordPress.
- El checkout privado, pasarelas, credenciales y procesamiento de pagos de Hostinger no están disponibles.
- Los precios y estados de disponibilidad son evidencia fechada al `2026-07-23`, no una garantía de vigencia futura.

La ausencia fue comprobada contra el API Hostinger, los 14.717 archivos del RAR, `public_html.zip`, ambos SQL, el WXR y la biblioteca de medios. Se mantiene explícita para evitar inventar datos.

## Seguridad y privacidad

No se versionaron ni publicaron:

- `.env`;
- `wp-config.php`;
- SQL;
- PHP;
- credenciales;
- claves o tokens;
- usuarios o pedidos;
- archivos RAR o ZIP originales;
- plugins o temas ejecutables.

## Validación

La restauración editorial fue verificada por el workflow `Restore Original WordPress Content` antes de crear el commit de contenido. La verificación incluyó:

- lint y formato;
- TypeScript;
- validación de catálogo;
- build cliente y SSR;
- prerender de 537 rutas, redirecciones y 404;
- 14 pruebas unitarias;
- 64 pruebas Playwright aprobadas y 2 omisiones previstas;
- auditoría de salida;
- auditoría de secretos.

El CI principal debe validar el SHA final de `main` antes de que el workflow de Cloudflare Pages despliegue ese mismo commit.
