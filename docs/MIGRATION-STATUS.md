# Estado de migración

Fecha de actualización: **2026-07-23**.

## Resultado

La aplicación React/TypeScript continúa como arquitectura productiva, pero ya no sostiene que el Hostinger original carecía de productos, precios o carrito. El sitio público demuestra actividad de tienda; la implementación incorpora un catálogo normalizado, carrito local y consulta por WhatsApp sin simular un checkout recuperado.

La migración completa del inventario original **no está cerrada**. El catálogo publicado contiene dos productos usados como controles verificables y la infraestructura necesaria para incorporar el resto desde HTML público capturado o evidencia Hostinger serializada.

## Alcance implementado

- Modelo tipado de producto, categoría, activo, evidencia y procedencia.
- Contenido determinista en `src/generated/`.
- Dos productos públicos con nombre, ruta, categoría, descripción, precio ARS, unidad y fecha de captura.
- Tienda con búsqueda y filtro de categoría.
- Rutas individuales de producto y rutas finales de categoría.
- Carrito con `localStorage` versionado, cantidades, eliminación y subtotal.
- Consulta por WhatsApp al número público verificado; no hay envío automático.
- Product y Breadcrumb JSON-LD, canonical, Open Graph y sitemap.
- Crawler público conservador y cacheado.
- Importador Hostinger/Astro para uno o varios HTML/directorios.
- Decodificación de tipos Astro 0 a 11 y preservación controlada de tipos desconocidos.
- Informes de fuentes, rutas, activos, colisiones, faltantes y fidelidad.
- Pruebas unitarias del extractor y E2E del catálogo/carrito.
- Wrapper PowerShell conservador para captura, importación y validación local.

## Fuentes de verdad

```text
src/content.ts                     páginas, artículos, recetas y textos legales
src/generated/products.json        productos demostrables publicados
src/generated/categories.json      categorías demostrables publicadas
src/generated/site.json            configuración comercial pública verificada
src/catalog.ts                     contratos y acceso tipado
src/siteApp.tsx                    tienda, productos, carrito y rutas comerciales
scripts/import-hostinger-original.mjs
scripts/crawl-hostinger-original.mjs
```

## Respaldo WordPress inspeccionado

- Archivo: `shekinah-wordpress-reference(2).rar`.
- Tamaño: `185111245` bytes.
- SHA-256: `9ecc8d7d2846d34392880cac5f1f41be62794cacf84843c5ec0fb19988fa8ced`.
- Entradas: `14720`.
- SQL: 21 tablas con prefijo `wp_`; 35 filas en `wp_posts`, 20 attachments y ningún tipo de producto detectado.
- Utilidad: páginas, blog, recetas, textos legales e imágenes complementarias.
- Límite: no representa el inventario Hostinger original y no puede usarse para negar la existencia de productos.

No se versionaron ni expusieron `.env`, SQL, `wp-config`, credenciales, usuarios, plugins, temas o datos privados.

## Compatibilidad

Las rutas institucionales existentes se conservan. Se agregan:

- `/guayaba/`
- `/melena-de-leon-futuro-fungi-50ml/`
- `/tienda/categoria/hierbas-medicinales/`
- `/tienda/categoria/suplementos/`

El checkout de Hostinger no fue reactivado. El flujo comercial final es local y explícito: carrito informativo → WhatsApp → confirmación externa.

## Pendientes comprobados

- Inventario Hostinger completo no extraído en este entorno.
- Imágenes originales de los dos productos de control no recuperadas.
- IDs `prod_*`, SKU, stock y variantes no expuestos por las páginas públicas consultadas.
- Fidelidad visual completa no medible sin capturas equivalentes del Hostinger activo.
- Precios son evidencia fechada; no se presentan como garantía de vigencia futura.

## Validación remota

GitHub Actions debe validar el SHA exacto antes de que Cloudflare Pages lo despliegue. La conclusión solo puede registrarse después de revisar el workflow y el dominio estable asociados al mismo commit.
