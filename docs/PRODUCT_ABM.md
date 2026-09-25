# Gestión simplificada de productos web — 2026-09-25

## Alcance vigente

El encargo autoriza un ABM sencillo sobre los productos vigentes de Dux. El alta
inicial de productos, nombre, código, categorías, precio, unidades y existencias
continúan en Dux. En Shekinah el cliente puede editar descripción e imagen, dar
de baja la publicación web y volver a publicar. Esto actualiza la restricción de
administración exclusivamente de lectura posterior al retiro manual de 0018;
no reconstruye productos manuales ni cambia el contrato editorial de Mercado Libre.

## Interacción

- Lista compacta con imagen, nombre, código, categoría, precio y estado de publicación.
- Descripción y stock detallado plegados por defecto, con expansión nativa accesible.
- Búsqueda por nombre/código/categoría, filtros de estado y categoría; stock y orden en «Más filtros y orden».
- Páginas de hasta 50 productos para mantener una respuesta ágil con el catálogo
  completo; la búsqueda y el orden se aplican globalmente antes de paginar.
- Tachito con nombre accesible «Dar de baja …», confirmación específica, foco inicial
  en Cancelar, cierre con Escape y recuperación del foco después de la operación.
- La baja conserva su fila y aparece después de los publicados en los seis órdenes.
  «Volver a publicar» revierte exclusivamente la decisión de visibilidad.
- Editor limitado a imagen y descripción, guardado explícito, preview local de imagen,
  control de cambios sin guardar y bloqueo de envíos repetidos u operaciones simultáneas.
- Publicado y sin stock son estados diferentes. Publicar no garantiza disponibilidad
  comercial ni el levantamiento del mantenimiento general del sitio.

La expansión solicitada se aplica al ABM administrativo. Las fichas públicas mantienen
su presentación actual; reciben el contenido guardado cuando el sitio está abierto.

## Persistencia y API

`0025_dux_product_web_settings.sql` agrega una tabla por empresa/código Dux y tres
guards de nuevas solicitudes/preparaciones/intentos de reserva. No modifica migraciones
previas, snapshot, stock, pedidos, pagos ni catálogo manual histórico. La tabla nace
vacía: la ausencia de una decisión mantiene el producto publicado y el contenido heredado.

La proyección final es Dux → contenido preservado → Mercado Libre activo aprobado →
edición web explícita. `NULL` hereda; descripción vacía o galería `[]` quitan ese campo.
El nombre presentacional sigue proviniendo de Dux o de Mercado Libre autorizado.
La edición web es independiente por campo, por lo que cambiar imagen o texto no reactiva
una baja concurrente. Las decisiones sobreviven a una sincronización de inventario.

- `GET /api/admin/products`: incluye publicados y dados de baja.
- `GET /api/admin/products/:id`: lee identidad Dux aun con catálogo público oculto.
- `PATCH /api/admin/products/:id`: sólo `description` (hasta 12.000 caracteres)
  y/o `publicationStatus` (`published` / `unpublished`).
- `DELETE /api/admin/products/:id`: baja reversible, responde `{ product }`.
- `PUT` / `DELETE /api/admin/products/:id/image`: reemplaza/quita imagen web.
- `POST` de productos y `PUT` de producto completo siguen rechazando catálogo manual.

Las escrituras conservan sesión administrativa server-side, mismo origen y auditoría.
Las imágenes conservan firma, MIME, límite 4 MiB y rutas R2 first-party. No se borran
assets versionados ni imágenes preservadas/editoriales que sigan referenciadas.
El tachito es SVG de interfaz solicitado por el usuario; no es un activo comercial.

El catálogo y ficha públicos excluyen bajas y recalculan conteos de categorías.
El servidor rechaza carritos viejos con códigos dados de baja antes de crear una
solicitud, preparar un pedido o reclamar el primer POST Dux. Los triggers cierran las
carreras de esas operaciones. La baja conserva reservas, pagos y operaciones Dux ya
intentadas, que siguen siendo recuperables por el flujo idempotente. Si todavía no
se intentó reservar, cierra de forma atómica el borrador local y su intención de compra.

## Publicación y verificación

Lecturas sin 0025 conservan compatibilidad durante el despliegue; escrituras sin la
migración responden 503 explícito. Ejecutar validación local completa, publicar por Git,
acreditar CI y Pages del mismo SHA, guardar bookmarks D1 y aplicar 0025 primero en Preview,
verificar esquema/FK/historia y después Production. No cambiar flags comerciales,
mantenimiento, OAuth ni sincronizadores por este ABM. No dar de baja productos reales
como smoke productivo sin una selección comercial expresa.

La evidencia de ejecución se conserva en
[el registro de validación](validation/PRODUCT_ABM_2026-09-25.md).
