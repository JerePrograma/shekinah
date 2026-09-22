# Validación de editorial Mercado Libre activo — 2026-09-22

## Base y resguardo

Repositorio `JerePrograma/shekinah`, trabajo directo sobre `main` y `origin/main`.
HEAD remoto sincronizado: `fa2001c65b3fe7da6f9c854744d62d64e79b1845`.
La actualización inicial estaba bloqueada por 18 archivos modificados y 8 nuevos
ajenos al encargo, sobre `ac67cce014850fea9a8730008a6c207255947419`.
El usuario autorizó expresamente su resguardo en el stash
`f84d979a455232fa11ca2e3310b1276c4582dd4e`, conservado sin aplicar ni eliminar.
Después del resguardo se completó el flujo de sincronización y el árbol quedó limpio.

## Cambio y límites

El [contrato editorial](../MERCADO_LIBRE_EDITORIAL.md) admite sólo `active` y
agrega el título validado al JSON inmutable de contenido y a su hash existente.
No requiere migración. La lectura pública comprueba también la metadata de la
misma ejecución completa, su hash, seller, estado, revisión e identidades.
Los objetos históricos sin título mantienen el nombre Dux; las fuentes pausadas
históricas dejan de aplicarse. Una ejecución fallida conserva el puntero anterior.

Revisado por código: catálogo, ficha, búsqueda, carrito y WhatsApp consumen el
nombre público como presentación. ID, slug y código Dux permanecen estables.
Los fingerprints del navegador usan producto/cantidad/versión; analítica usa
ID/ruta. Solicitud comercial, preparación directa/asistida y snapshots de pedido
leen Dux. Mercado Pago recibe esas líneas existentes. No hay cambios funcionales
en reserva, shipping, checkout, preferencias, pagos, webhook ni reconciliación.

Los casos automatizados cubren estados no activos, título corrupto, objetos
históricos, identidad Dux/fuente, revisión y hashes inválidos, ambigüedad de
publicaciones/variantes, fallo de API, retirada atómica y conservación de campos
comerciales. Los mocks usan deliberadamente precio, cantidad y moneda ML
distintos de Dux para demostrar que no se importan.

## Verificación externa de sólo lectura

Verificado mediante Cloudflare autenticado y consultas D1 remotas con cero
filas escritas:

- snapshot productivo Dux: 863 productos;
- Production y Preview: cero conexiones OAuth ML, cero ejecuciones editoriales
  y cero asociaciones aprobadas;
- ambos entornos: `MERCADO_LIBRE_EDITORIAL_ENABLED=false` y
  `MERCADO_LIBRE_CATALOG_ENABLED=false`, sin credenciales propias ML configuradas;
- se conservan los bindings D1/R2 separados y la compra directa productiva;
- no se modificaron flags, secretos, tablas, inventario, pedidos ni pagos.

No disponible: seller real autenticado, publicaciones activas consultadas,
candidatos ambiguos/sin match, bajas reales e importación. Falta configurar la
aplicación propia ML y obtener OAuth del titular. Mercado Pago no se consultó
como fuente editorial. El login administrativo de Chrome no tenía sesión.

La comprobación de Chrome contra `https://shekinah.ar` encontró
`net::ERR_CERT_AUTHORITY_INVALID`; no se omitió la protección del navegador.
Es una limitación de la comprobación desde este entorno, no evidencia suficiente
para atribuir una falla al certificado productivo.
La pestaña alternativa de Chrome hacia el dominio técnico no pudo adjuntarse
y el siguiente intento agotó el tiempo de la herramienta. La lectura HTTPS de
`https://shekinah-7dl.pages.dev/api/catalog` sí devolvió 200, fuente `dux`,
863 productos y 14 categorías, sin omitir validación TLS.

## Validación local

Runtime verificado: Node.js 24.18.0 y npm 11.16.0. El runtime oficial se descargó
fuera del repositorio y se comprobó su SHA-256 contra el manifiesto del proveedor.

- `npm ci`: verificado; 201 paquetes instalados. npm informó cuatro avisos de
  auditoría (dos moderados y dos altos); no se cambiaron dependencias ni lockfile.
- `npm run install:browsers`: verificado.
- Pruebas dirigidas de política, sincronización, imágenes, acceso y panel
  editorial: verificado, 68 pruebas antes de los dos últimos casos añadidos.
- Primer `npm run typecheck`: fallido por una aserción de test sobre la unión
  comercial; se corrigió la aserción sin modificar el modelo de producto.
- Primer `npm run verify`: fallido por asignación JSON sin cast explícito;
  se alineó la lectura con el patrón tipado del store existente.
- Suite completa posterior a las correcciones: verificado, 120 archivos,
  846 pruebas aprobadas y 14 omitidas. Las omitidas pertenecen al bloque histórico
  de reservas locales de WhatsApp, retirado del flujo productivo.
- `npm run verify` final: verificado, salida 0. Lint, TypeScript, suite completa,
  catálogo, pesos, build, activos, seguridad y automatización aprobados;
  Playwright Chromium: 30 pruebas aprobadas (3,2 minutos).
- Primer `npm run build:pages`: fallido; 119 archivos aprobados, uno fallido;
  845 pruebas aprobadas, una fallida y 14 omitidas. La prueba preexistente
  `src/admin/DuxPanel.test.tsx` intentó leer `Plan / token API` mientras el panel
  todavía mostraba `Consultando configuración y sincronización Dux…`. Espera
  el encabezado estático antes de consultar métricas asíncronas; el componente
  editorial está simulado como `null` en ese archivo. El código y la prueba Dux
  no se modificaron en este encargo. La misma prueba pasó en `npm run verify`.
- `npm run test -- src/admin/DuxPanel.test.tsx --maxWorkers=1`: verificado,
  cuatro pruebas aprobadas sin cambios (7,68 segundos).
- Repetición de `npm run build:pages` con `VITEST_MAX_WORKERS=2`, sólo en el
  entorno del proceso y sin alterar el repositorio: verificado, salida 0;
  120 archivos aprobados, 846 pruebas aprobadas y 14 omitidas. También pasaron
  lint, tipos, catálogo, pesos, build, activos, seguridad y automatización.
- `git diff --check` y `git diff --cached --check`: verificados.
- Enlaces documentales relativos y lista de rutas: verificados. No se incluyen
  dependencias, migraciones, secretos, binarios, capturas ni artefactos de build.

CI, artefacto y Pages se deben acreditar sobre el commit publicado, por separado
de la validación local y de la conexión real a Mercado Libre.
