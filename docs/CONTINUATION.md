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
- Cloudflare Access;
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
- Cloudflare Access configurado para administración;
- pruebas de humo aprobadas.

### Autorización manual vigente

El 2026-08-10 quedaron expresamente autorizados como datos públicos actuales:

```text
Sitio: https://shekinah-7dl.pages.dev/
WhatsApp: +549 2236 21-6559
Link de Pago: https://link.mercadopago.com.ar/shekinahmoreno
```

El código puede usar el WhatsApp normalizado `5492236216559` y el Link de Pago como fallback manual mientras `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false`. Esta autorización no habilita Checkout Pro, D1, webhooks, analítica ni administración.

El fallback manual no requiere VPS. El backend futuro continúa siendo Pages Functions y D1.

## Identidad externa verificada

- Proyecto Pages: `shekinah`.
- Dominio Pages: `shekinah-7dl.pages.dev`.
- Repositorio conectado: `JerePrograma/shekinah`.
- Rama de producción: `main`.
- Existe un Worker independiente también llamado `shekinah`; no usar sus settings para configurar Pages.

El inventario autenticado del 2026-08-04 encontró cero bases D1, cero variables/secretos/bindings en Pages y Zero Trust sin configurar. Producción y preview estaban en `Fail open`; los previews eran públicos.

## Próximos pasos

1. verificar el deployment y smoke público del fallback manual autorizado;
2. cambiar producción y preview de Pages a `Fail closed`;
3. obtener el nombre exacto autorizado para D1 preview; `shekinah-commerce` ya está documentado únicamente para producción;
4. crear bases D1 separadas, migrar primero preview y comprobar el esquema;
5. vincular ambos entornos mediante el binding exacto `DB`;
6. definir Team Domain y crear la organización/aplicación de Cloudflare Access;
7. proteger `/admin*` y `/api/admin/*` y comprobar permitido/denegado;
8. configurar variables no secretas con los flags de Checkout Pro y analítica en `false` y cargar secretos mediante prompts protegidos;
9. validar Mercado Pago sandbox y webhook;
10. restringir previews con Access;
11. activar únicamente capacidades autorizadas y ejecutar pruebas de humo;
12. al activar Checkout Pro productivo, decidir explícitamente si el fallback manual se retira o permanece.

## Prohibiciones

- no inventar secretos, IDs, dominios, números ni políticas de retención;
- no guardar credenciales en Git;
- no agregar parámetros no documentados al Link de Pago para simular un monto precargado;
- no tratar el fallback manual como pago verificado automáticamente;
- no activar Checkout Pro productivo sin comprobaciones;
- no confundir build aprobado con deployment aprobado;
- no confundir deployment con configuración productiva completa.
