# Administración como aplicación de trabajo

Diseño de la segunda iteración visual, 2026-09-28. Complementa la mejora funcional
del 27 de septiembre; no reemplaza sus contratos ni su registro histórico.

## Estructura y jerarquía

- `/admin` usa un marco propio, sin cabecera ni pie de la tienda pública.
  En escritorio, una barra lateral persistente organiza Gestión (Inicio, Pedidos,
  Productos) y Herramientas (Actualizaciones, Visitas, Actividad).
- A menos de 900 px, la navegación es un desplegable accesible dentro del flujo:
  botón con estado y relación explícitos, Escape, cierre al elegir sección y foco
  en su título. No es un diálogo ni captura el teclado.
- Inicio prioriza pendientes del período consultado. Los importes financieros se
  separan de interacciones y visitas; los informes secundarios se despliegan.
- Pedidos conserva la lista y muestra el detalle al lado desde 1200 px. En anchos
  menores, el detalle precede al listado y recibe foco visible. El pago se muestra
  en el detalle con evidencia del contrato existente, sin inferirlo del estado
  comercial de una fila.
- Productos conecta lista y editor, destaca la fila seleccionada y conserva el
  editor montado al cambiar de sección. La búsqueda/estado/categoría forman una
  barra compacta; stock y orden están en un desplegable. Ayuda al pie del listado.
- Actualizaciones presenta Dux y Mercado Libre como proveedores distintos, con
  acciones, estados y fechas disponibles. Revisión editorial, controles avanzados
  y soporte se despliegan; no se inventa una fecha de actualización.

## Sistema visual

Los estilos administrativos residen en `src/admin/admin.css`, cargado con el módulo
administrativo. Fondo neutro, superficies blancas, separadores finos, verde para
selección/acción principal y estados con texto además de color. Tipografía base
de 15 px, títulos de 28–30 px y botones principales de al menos 44 px de alto.
Se reutiliza el isotipo autorizado y se dibujan iconos decorativos como SVG inline,
sin dependencias ni recursos binarios nuevos. Las reglas públicas de
`src/commerce.css` se conservan al retirar los estilos administrativos anteriores.

Los formularios mantienen etiquetas, los paneles tienen títulos relacionados,
los cambios/errores usan los anuncios existentes y los destinos de foco son
visibles. Los detalles cerrados retiran sus controles del recorrido de teclado.
La selección de sección, apertura/cierre de editor, paginación y confirmaciones
mantienen una continuidad explícita del foco.

## Contratos preservados

SPA e History API; sesión y bloqueos durante operaciones; máximo de 50 productos
montados tras búsqueda/filtro/orden sobre el catálogo completo; borrador, validación
de imagen y baja reversible. Dux mantiene inventario, unidades y autoridad
comercial. Mercado Libre sólo aporta contenido editorial autorizado; Mercado Pago
mantiene autoridad financiera. No se modifican endpoints, D1, migraciones, secretos,
precios, stock, configuración de mantenimiento ni activación comercial.

Las capturas, controles ejecutados y límites se registran en
[la validación de esta iteración](../validation/ADMIN_REDESIGN_2026-09-28.md).
