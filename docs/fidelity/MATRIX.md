# Matriz de fidelidad

Fecha de evidencia pública: **2026-07-23**.

## Controles de producto

| Ruta original | Ruta final | Tipo | ID original | Título | Precio | Categoría | Imagen | Interacciones | Procedencia | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| `/guayaba` | `/guayaba/` | producto | no expuesto | Guayaba hojas x 50 gr | ARS 8999 | Hierbas medicinales | pendiente | cantidad, carrito, eliminar, persistencia, WhatsApp | hostinger-public | parcial |
| `/melena-de-leon-futuro-fungi-50ml` | `/melena-de-leon-futuro-fungi-50ml/` | producto | no expuesto | Melena de león Futuro fungi 50ml | ARS 32500 | Suplementos | pendiente | cantidad, carrito, eliminar, persistencia, WhatsApp | hostinger-public | parcial |

## Métricas sobre el conjunto de controles verificados

| Métrica | Fuente | Detectado | Recuperado | Faltante | Porcentaje | Observaciones |
|---|---|---:|---:|---:|---:|---|
| Productos de control | Hostinger público | 2 | 2 | 0 | 100% | No representa el total del catálogo. |
| Nombres | Hostinger público | 2 | 2 | 0 | 100% | Coincidencia textual. |
| Rutas | Hostinger público | 2 | 2 | 0 | 100% | Se normaliza slash final. |
| Descripciones | Hostinger público | 2 | 2 | 0 | 100% | Resumen normalizado, sin claims médicos. |
| Precios y moneda | Hostinger público | 2 | 2 | 0 | 100% | Históricos al 2026-07-23. |
| Unidades/presentaciones | Hostinger público | 2 | 2 | 0 | 100% | 50 g y 50 ml. |
| Categorías | Hostinger público | 2 | 2 | 0 | 100% | Rutas finales inferidas y etiquetadas. |
| Imágenes de producto | Hostinger público | 2 | 0 | 2 | 0% | No se publica sustituto. |
| IDs `prod_*` | Astro/Hostinger | 2 | 0 | 2 | 0% | No expuestos en evidencia disponible. |
| Interacciones comerciales | Hostinger público | 8 | 8 | 0 | 100% | Agregar, cantidad, persistir y WhatsApp por producto. |
| SEO de producto | Aplicación final | 2 | 2 | 0 | 100% | Product y Breadcrumb JSON-LD, canonical y sitemap. |

**Fidelidad medible del conjunto de controles:** `24 / 28 = 85,71%`.

Este porcentaje evalúa campos e interacciones de dos productos control; **no** mide la completitud del inventario original. El porcentaje global del catálogo permanece `NO MEDIBLE` hasta ejecutar el crawler/importador sobre todas las rutas y establecer el total detectado.

## Matriz global

| Área | Estado | Diferencias comprobadas |
|---|---|---|
| Estructura institucional | parcial | React conserva rutas y contenidos, pero no existe comparación bloque por bloque del Hostinger activo. |
| Contenido WordPress complementario | recuperado | Páginas, posts, recetas y uploads inspeccionados; no aporta productos. |
| Catálogo | parcial | Dos controles publicados; total original desconocido. |
| Visual | no medido | Faltan capturas equivalentes y activos de producto. |
| Responsive | implementado | Viewports móvil, tablet y escritorio cubiertos por Playwright. |
| Navegación | implementado | Tienda, categorías y productos prerenderizados. |
| Carrito | implementado | Local, versionado, sin checkout privado. |
| WhatsApp | implementado | Número público verificado; acción explícita. |
| SEO | implementado | Canonical, Product, Breadcrumb, sitemap y 404. |
| Activos | parcial | Activos institucionales existentes; imágenes de productos pendientes. |

## Criterio de cierre

No declarar 100% hasta que `generated/hostinger-original/fidelity.json` derive el total desde la captura real y todas las diferencias se documenten por ruta.
