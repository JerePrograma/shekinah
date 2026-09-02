# Corte del catálogo público a Dux — 2026-09-02

## Decisión

El objetivo autorizado es que Dux gobierne el universo público de productos, su nombre, código, precio y clasificación. El catálogo local deja de determinar qué productos existen públicamente. Puede aportar imágenes, presentación y descripción únicamente cuando exista un mapping Dux único; un producto sólo local no se publica después del corte.

La lista pública seleccionada por contrato observado es `PRECIOS DEL NEGOCIO`. `MERCADO LIBRE` no se usa para el sitio. Una lista ausente, duplicada o con precio no positivo/inválido aborta la publicación completa y conserva la fotografía Dux anterior.

## Evidencia previa

El diagnóstico administrativo desplegado sobre `c36000d6d92addadd6c06c69fb56cd61c6e15d93` observó en `/v2/items`:

- total paginado: 747 ítems habilitados;
- `cod_item`, `item`, `habilitado`, `precios` y `rubro` presentes en la primera página;
- exactamente dos precios por ítem de la muestra: `PRECIOS DEL NEGOCIO` y `MERCADO LIBRE`;
- `sub_rubro` nulo en la muestra;
- `imagen_url` nulo y `descripcion` ausente en la muestra.

El snapshot cuantitativo anterior contiene 679 ítems porque 68 registros con `stock_real`, `stock_reservado` y `stock_disponible` simultáneamente nulos se excluyen sin convertirlos a cero. El catálogo nuevo conserva esos 68 ítems como productos Dux no vendibles.

## Candidato

El candidato agrega `0015_dux_catalog_snapshot.sql` y captura los metadatos comerciales durante la misma paginación usada por el inventario. No realiza una segunda descarga, no suma llamadas por producto y no modifica Dux.

La publicación comercial se vincula a un `dux_sync_runs` completo y guarda una única fotografía JSON hasheada. El API público consume esa fotografía y genera categorías desde `rubro`/`sub_rubro`. Las imágenes remotas de Dux no se exponen: el contrato de activos continúa admitiendo sólo rutas locales o R2 first-party autorizadas.

Durante la ventana entre deployment y primera fotografía, el backend conserva el catálogo anterior para evitar una interrupción. La primera publicación Dux elimina automáticamente ese modo transitorio. Desde entonces, una caída del API público no reconstruye los productos compilados en el navegador.

## Estado que todavía no se afirma

Este documento no acredita por sí solo:

- migración `0015` aplicada en preview o producción;
- nueva sincronización posterior a la migración;
- fotografía con exactamente 747 productos;
- respuesta productiva `/api/catalog` gobernada por Dux;
- smoke del dominio canónico;
- habilitación de Checkout Pro o WhatsApp.

Unidad, divisibilidad y lifecycle de pedidos continúan sin verificarse. Todos los productos Dux permanecen no vendibles y `COMMERCE_ENABLED`/`VITE_COMMERCE_ENABLED` deben seguir en `false`.
