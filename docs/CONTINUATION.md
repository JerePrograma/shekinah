# Continuación

## Fuente de verdad

Trabajar exclusivamente sobre el estado real de `main` y `origin/main`.

Antes de modificar:

```bash
git status
git switch main
git fetch origin
git pull --ff-only origin main
```

## Estado funcional esperado

El repositorio contiene una evolución full-stack basada en:

- React, TypeScript estricto y Vite;
- Cloudflare Pages Functions;
- Cloudflare D1;
- Mercado Pago Checkout Pro preparado para activación;
- fallback manual temporal de Link de Pago más WhatsApp;
- autenticación administrativa propia y Cloudflare Access opcional;
- analítica first-party opcional.

Consultar primero:

1. `AGENTS.md`;
2. `docs/CODEX_AUTORREFERENCIA.md`;
3. `docs/CURRENT_STATE.md`;
4. `docs/ARCHITECTURE.md`;
5. `docs/FULL_STACK_COMMERCE.md`;
6. `docs/FULFILLMENT_AND_RETENTION.md`;
7. `docs/COMMERCE_OPERATIONS.md`;
8. `docs/COMMERCE_DEPLOYMENT.md`;
9. `docs/COMMERCE_INCIDENTS_AND_ROLLBACK.md`.

## Regla de activación

No habilitar Checkout Pro, analítica ni nuevas capacidades externas por el solo hecho de que el código compile.

La activación de Checkout Pro requiere evidencia separada de:

- D1 creado y vinculado;
- migraciones aplicadas;
- secretos cargados sin exposición;
- credenciales de Mercado Pago válidas;
- webhook con URL definitiva;
- autenticación administrativa propia configurada y probada;
- pruebas de humo aprobadas.

### Autorización manual vigente

El 2026-08-10 quedaron expresamente autorizados como datos públicos actuales:

```text
Sitio: https://shekinah-7dl.pages.dev/
WhatsApp: +549 2236 21-6559
Link de Pago: https://link.mercadopago.com.ar/shekinahmoreno
```

El código puede usar el WhatsApp normalizado `5492236216559` y el Link de Pago como fallback manual mientras `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false`. Esta autorización no habilita Checkout Pro, webhooks ni analítica. D1 y la administración se autorizan y verifican por separado.

El fallback manual no requiere VPS. El backend futuro continúa siendo Pages Functions y D1.

## Identidad externa verificada

- Proyecto Pages: `shekinah`.
- Dominio Pages: `shekinah-7dl.pages.dev`.
- Repositorio conectado: `JerePrograma/shekinah`.
- Rama de producción: `main`.
- Existe un Worker independiente también llamado `shekinah`; no usar sus settings para configurar Pages.

El inventario y la configuración autenticados del 2026-08-10 confirmaron dos D1 nuevas y aisladas (`shekinah-commerce` y `shekinah-commerce-preview`), binding `DB`, migraciones `0001` a `0005`, cuatro secretos administrativos cifrados por entorno y `Fail closed` en production/preview. Zero Trust/Access continúa sin configurar porque es un fallback opcional; existe además un Worker homónimo que permanece intacto.

## Próximos pasos

1. resolver siempre el SHA vigente de `main` y `origin/main` antes de continuar;
2. comprobar CI y deployment de Pages para ese mismo SHA;
3. confirmar que `DB`, `Fail closed`, migraciones y nombres cifrados `ADMIN_*` siguen presentes en ambos entornos;
4. ejecutar el smoke administrativo: API 401, login, alta, consulta, modificación, baja, logout y nuevo 401;
5. no crear una política externa de Access sobre todo `/admin*` o `/api/admin/*`, porque bloquearía el login propio; configurarlo sólo si se diseña como defensa adicional compatible;
6. mantener Checkout Pro y analítica cerrados hasta validar Mercado Pago sandbox, webhook y autorizaciones correspondientes;
7. al activar Checkout Pro productivo, decidir explícitamente si el fallback manual se retira o permanece.

## Prohibiciones

- no inventar secretos, IDs, dominios, números ni políticas de retención;
- no guardar credenciales en Git;
- no agregar parámetros no documentados al Link de Pago para simular un monto precargado;
- no tratar el fallback manual como pago verificado automáticamente;
- no activar Checkout Pro productivo sin comprobaciones;
- no confundir build aprobado con deployment aprobado;
- no confundir deployment con configuración productiva completa.
