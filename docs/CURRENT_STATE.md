# Estado actual

Fecha de revisión: 2026-08-26.

## Decisión de inventario

Dux Software reemplaza al stock local y a Mercado Libre como autoridad de inventario:

- Dux: identidad externa, cantidades, depósitos, unidad/medida, pedidos/reservas y sincronización Mercado Libre;
- Shekinah: catálogo editorial, precio actual, carrito, orden local y coordinación;
- Mercado Pago: Checkout Pro, pago y webhook;
- Mercado Libre: sincronizado por Dux, sin integración directa de stock desde Shekinah.

No se usa Excel. No se copian 1.525 productos manualmente. No se infiere unidad, peso, divisibilidad o presentación desde nombres. Las cantidades Dux se preservan exactamente como números finitos y no se redondean ni convierten.

## Código preparado

El candidato incorpora:

- cliente server-side Dux API v2 con Bearer;
- lecturas oficiales de empresas, sucursales, depósitos e items;
- paginación, validación defensiva, timeout, rate limit de una solicitud cada cinco segundos y retry limitado de lecturas;
- `migrations/0012_dux_authoritative_inventory.sql` para contexto, sync, snapshot/mapping y trazabilidad futura de pedidos;
- mapping exacto con estados `mapped`, `unmapped` y `ambiguous`;
- proyección D1 read-only sin convertirla en autoridad;
- backoffice Dux de diagnóstico y stock no editable;
- scheduler Dux read-only desactivado por default;
- retiro funcional de OAuth, sync, webhook y reserva directa Mercado Libre;
- guard fail-closed de Checkout Pro y WhatsApp.

El código histórico de stock local y Mercado Libre no se borra masivamente. Se conserva para compatibilidad y auditoría, pero queda fuera del flujo activo cuando se adopta Dux.

## API Dux implementada

```text
Base: https://erp.duxsoftware.com.ar/WSERP/rest/services
Autenticación: Authorization: Bearer <token>
GET /v2/empresas
GET /v2/sucursales?id_empresa=...
GET /v2/depositos
GET /v2/items
```

No se implementan mutaciones contra endpoints no documentados. Aunque la documentación pública expone `POST /v2/pedidos` y `GET /v2/pedidos`, el candidato no crea pedidos porque no existe evidencia pública suficiente de cancelación/liberación/finalización o expiración segura.

## Bloqueos externos

### Plan y token

La cuenta mostrada por el cliente indica **Plan ESTÁNDAR**. La documentación Dux vigente indica que la API requiere PRO o FULL. No hay token disponible/verificado en esta sesión y no se ejecutaron llamadas autenticadas.

Pendiente externo:

```text
Upgrade Dux a PRO/FULL + token API requerido
```

### Semántica de cantidades

`GET /v2/items` publica cantidades de stock y algunos identificadores, pero no publica de forma suficiente:

- unidad de medida;
- pesabilidad;
- divisibilidad;
- soporte o paso de cantidad decimal.

Por eso ninguna cantidad observada habilita por sí sola una cantidad de carrito. La proyección marca esa semántica como no verificada y falla cerrada.

### Lifecycle de pedidos

La API pública revisada no documenta un mecanismo seguro para:

- cancelar/anular y liberar reserva;
- finalizar/confirmar consumo;
- expirar reservas abandonadas;
- reconciliar de manera concluyente un timeout mutante;
- garantizar idempotencia o rechazo atómico por stock insuficiente.

Éste es un hard blocker productivo. El backend no crea pedido Dux, preferencia Mercado Pago ni pedido WhatsApp.

La migración `0012` aplica un hard block adicional en D1: impide líneas y cambios de estado para pedidos vinculados a Dux y pone en cuarentena órdenes históricas con productos ya asociados a una identidad/candidata Dux. Webhook, conciliación y expiración también los excluyen; los flujos legacy sólo continúan sin relación Dux.

## Flags

Defaults seguros versionados:

```text
DUX_API_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

El scheduler exige además `DUX_RECONCILIATION_ENABLED=true` en GitHub. No debe configurarse todavía.

## Producto y UX

Shekinah conserva el catálogo editorial, carrito, páginas públicas, backoffice, imágenes R2, privacidad y analítica. Para inventario Dux:

- cero o negativo: agotado;
- mapping ausente o ambiguo: producto preservado, no vendible;
- semántica de unidad no verificada: no vendible;
- Dux caído y snapshot obsoleto: no vendible temporalmente;
- refresh en curso: feedback visible sin borrar el carrito.

El comprador no ve IDs Dux, depósito técnico, token o error crudo. El administrador ve estado de vínculo, cantidad observada, depósito, fecha y error sanitizado. El stock Dux es sólo lectura.

## Mercado Pago

La integración Checkout Pro existente mantiene cálculo server-side, `external_reference`, metadata, webhook firmado, consulta autoritativa e idempotencia. Sin embargo, la creación de preferencia está bloqueada antes de llamar a Mercado Pago hasta que Dux pueda reservar y compensar con seguridad.

No se ejecutó un pago real. La aplicación autorizada sigue siendo `Shekinah`, Application ID `7373984348988262`, sin exponer credenciales.

## Mercado Libre

La integración directa de inventario está retirada. Los flags permanecen en `false`; los endpoints históricos no sincronizan ni mutan stock y el scheduler anterior fue reemplazado por uno Dux read-only desactivado.

La tienda `HERBOLARIOMDP` y seller ID `445638367` continúan bajo la integración propia Dux ↔ Mercado Libre. El valor no se interpreta como ID Dux.

## Persistencia

La migración aditiva `0012_dux_authoritative_inventory.sql` existe en el repositorio candidato. No se afirma que esté aplicada en preview o production. Debe ejecutarse primero en preview con backup/Time Travel y verificación de esquema, y luego en production.

Las migraciones, órdenes, pagos, auditoría, catálogo, imágenes y tablas históricas Mercado Libre existentes se preservan.

## Cloudflare y GitHub

La arquitectura continúa sobre Cloudflare Pages, Pages Functions, D1 y R2, rama `main` del repositorio `JerePrograma/shekinah`. El workflow de reconciliación Dux usa el environment GitHub `cloudflare-pages-production`, pero permanece condicionado a una variable explícita desactivada.

No se afirma que el candidato esté desplegado, que `0012` esté aplicada, que existan secrets Dux en Pages o que el deployment corresponda al futuro commit. Esos estados deben verificarse después del push sobre el SHA exacto.

## Calidad

Entorno canónico:

- Node.js `24.18.0`;
- npm `>=11.0.0`;
- TypeScript estricto;
- ESLint;
- Vitest;
- Playwright;
- verificadores de catálogo, seguridad y automatización.

Los resultados del candidato deben registrarse después de ejecutar `npm run verify`, `npm run build:pages`, revisar diff, crear commit y hacer push. No reutilizar conteos de una sesión histórica como evidencia actual.

## Separación de estados

Toda continuidad debe distinguir:

1. código integrado;
2. validación local;
3. commit y push;
4. GitHub Actions;
5. deployment Pages;
6. migración `0012`;
7. secrets y variables Dux;
8. acceso API real;
9. mapping real;
10. lifecycle de reserva/liberación/finalización;
11. sandbox Mercado Pago;
12. activación productiva y pago autorizado.

Ninguna etapa demuestra automáticamente la siguiente. El estado productivo actual es **bloqueado por configuración externa y limitación de API**.
