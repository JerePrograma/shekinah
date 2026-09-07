# Retiro de productos manuales y stock Dux

## Autorización y alcance — 2026-09-07

El usuario pidió eliminar el 100% de los productos manuales y usar las existencias reales cargadas en Dux. Confirmó conservar las fotos y descripciones vinculadas a Dux. La base de código es `d439d7c3a9f79212db859248717e5d293f0a701b`, con 749 productos Dux publicados, 135 vínculos editoriales y comercio cerrado.

El respaldo previo observa 510 productos manuales en Preview y 513 en producción (21 filas de mutaciones, 20 activas). Los 135 vínculos reutilizan imágenes en 134 productos y descripción en 127. Esos contenidos se preservan independientemente de los registros manuales.

## Contrato de ejecución

1. Validar código, publicar en main, verificar CI y deployment del SHA.
2. Pausar el scheduler y comprobar que no haya sincronización en curso. Respaldar mutaciones, vínculos, snapshot, inventario y conteos de historia comercial fuera de Git, junto con su SHA-256 y punto de recuperación D1.
3. Aplicar `0018_retire_manual_catalog.sql` en Preview. Es una preparación aditiva: no borra productos ni activa el retiro por sí sola.
4. Copiar únicamente imágenes/descripción autorizadas por cada vínculo activo a `dux_editorial_content`, usando las fuentes actuales. Comprobar igualdad exacta de cada contenido y cardinalidad antes de continuar.
5. Insertar el único registro `manual_catalog_retirement`, con hash del respaldo, conteo real retirado, 135 contenidos y conteo/fecha máxima de mutaciones leídas. Los guards rechazan vínculos sin contenido, catálogo Dux deshabilitado o mutaciones concurrentes. Un trigger elimina físicamente todas las filas de `catalog_product_mutations` en la misma transacción que registra el retiro.
6. Comprobar catálogo manual efectivo vacío, mutaciones cero, creación/edición manual rechazadas, catálogo Dux completo y fotos/descripciones iguales, integridad referencial e historia comercial conservada. Comprobar que ocultar el catálogo nunca restaura los productos compilados.
7. Repetir en producción sólo después del resultado satisfactorio en Preview. Leer stock por el mecanismo oficial Dux y verificar la proyección pública; reabrir el scheduler cuando ambas verificaciones estén completas.

El informe y los recibos de esta operación se guardan en `C:\Users\Programador 2\Downloads\shekinah-dux-retiro-manual-stock-20260907`. Este documento describe el contrato; los recibos acreditan las operaciones efectivamente ejecutadas.

## Resultado de comportamiento

- Dux sigue siendo autoridad de existencia, nombre, SKU, categorías, precio y stock. El retiro no borra productos Dux.
- La tabla editorial nueva sólo contiene código Dux, referencia histórica de vínculo, imágenes, descripción y fecha; no contiene un producto manual alternativo, precio, stock ni categoría local.
- El administrador lista los productos Dux completos y sus categorías, incluso si la publicación está oculta. Las acciones de alta, edición comercial y eliminación manual dejan de ofrecerse; las escrituras manuales se rechazan en servidor y D1. La lectura de imágenes considera el contenido editorial preservado antes de limpiar activos.
- Las fichas públicas muestran `stock_real`, `stock_reservado` y `stock_disponible` observados por código Dux en el depósito configurado. Preservan decimales y negativos, no inventan unidades ni convierten nulos a cero. Indican la fecha de lectura de inventario más antigua de las filas agregadas y avisan si está vencida.
- El stock positivo y fresco se identifica como verificado aunque `checkoutEligible` siga siendo falso. No habilita carrito, pagos, pedidos ni reservas.
- El navegador no incluye ni reconstruye las fichas históricas como fallback ni registra sus 510 rutas como productos confirmados. Los archivos históricos, activos autorizados, pruebas y evidencias permanecen en el repositorio, sin servir como productos activos.
- Los 747 registros históricos de triage y vínculos se preservan. Los 294 candidatos manuales pendientes ya no pueden aprobarse contra productos eliminados; no se convierten en productos ni se borran sus decisiones. Desactivar un vínculo sigue retirando su contenido editorial del producto Dux.

## Recuperación

El retiro no puede revertirse mediante los controles administrativos habituales. Deshabilitar `public_catalog_enabled` oculta el catálogo y devuelve una lista Dux vacía. No restaura productos manuales. Ante una incidencia se conserva el código compatible con 0018, se corrige el contenido desde el respaldo o se realiza una recuperación D1 explícitamente autorizada. No desplegar código anterior al retiro: no conoce el marcador y podría reconstruir las fichas compiladas.

Workers Free se conserva. La implementación no requiere nuevos servicios, dependencias ni planes de pago. Checkout Pro, Mercado Libre directo y mutaciones de stock Dux permanecen fuera del alcance.
