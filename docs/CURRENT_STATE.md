# Estado actual

Fecha de revisión: 2026-08-10.

Base inicial de esta evolución administrativa:

`f704424f614b917ffd42eb47ab31e5057a7ba5ec`

Este documento describe el candidato de código integrado en el checkout. Su publicación, despliegue, configuración externa y activación productiva requieren evidencias separadas.

## Producto

Shekinah conserva:

- 510 productos;
- 16 categorías;
- precios en ARS;
- activos locales autorizados.

El candidato incorpora:

- carrito persistente;
- fallback manual temporal mediante Link de Pago de Mercado Pago sin monto predefinido;
- WhatsApp manual con número público expresamente autorizado;
- Mercado Pago Checkout Pro por redirección preparado pero todavía deshabilitado;
- pedidos y consulta pública de estado para Checkout Pro;
- webhook de Mercado Pago para Checkout Pro;
- Cloudflare Pages Functions;
- migraciones aditivas de Cloudflare D1 para comercio, fulfillment, catálogo, retención y rate limiting administrativo;
- autenticación administrativa propia con PBKDF2, cookie firmada, login/logout y fallback opcional de Cloudflare Access;
- ABM de productos basado en catálogo canónico más mutaciones y tombstones D1;
- analítica first-party con consentimiento;
- exportaciones administrativas;
- eliminación de sesión analítica.

## Configuración pública autorizada

Autorización explícita recibida el 2026-08-10:

```text
PUBLIC_SITE_URL=https://shekinah-7dl.pages.dev
VITE_WHATSAPP_NUMBER=5492236216559
VITE_MERCADO_PAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/shekinahmoreno
```

El fallback manual usa esos datos públicos sin secretos. Cuando `VITE_COMMERCE_ENABLED` no vale `true`, el carrito puede copiar el total calculado y abrir el Link de Pago; el comprador ingresa el monto en Mercado Pago y debe enviar el carrito por WhatsApp para que el comercio pueda asociar el pago y coordinar la entrega. Este flujo no crea pedidos en D1, no genera una preferencia de Checkout Pro y no confirma automáticamente pagos.

No se requiere VPS para este fallback. La arquitectura automatizada tampoco depende de un VPS: su backend previsto son Cloudflare Pages Functions y D1.

## Estado operativo

La presencia del código no implica activación del Checkout Pro automatizado.

Checkout Pro y analítica continúan separados del backoffice. Al cierre de configuración del 2026-08-10:

- Checkout Pro automatizado deshabilitado;
- analítica deshabilitada;
- fallback manual de Link de Pago autorizado en el código;
- WhatsApp manual autorizado en el código;
- D1, binding, migraciones y secretos administrativos están configurados de forma aislada en production y preview;
- la administración quedó operativa tras verificar por separado CI, deployment, login, logout y smoke ABM sobre `7f93e29ad64f081b2dd1efe7f3c4c4b53e081225`; el catálogo es editable y pedidos/analítica permanecen de sólo lectura;
- webhook no considerado productivo.

## Estado externo verificado

Consulta y configuración autenticadas realizadas el 2026-08-10, sin registrar IDs de cuenta, correos ni valores secretos:

- el proyecto de Cloudflare Pages se llama exactamente `shekinah` y publica `shekinah-7dl.pages.dev`;
- la rama de producción es `main`, el build es `npm run build:pages`, la salida es `dist` y los deployments automáticos están habilitados;
- producción usa `shekinah-commerce` y preview `shekinah-commerce-preview`, ambas creadas vacías y vinculadas como `DB`;
- `d1_migrations` registra `0001` a `0005` en ambos entornos; `0004_catalog_admin.sql` y `0005_admin_auth.sql` están aplicadas;
- los cuatro nombres `ADMIN_*` requeridos existen como secretos cifrados separados en production y preview;
- `PUBLIC_SITE_URL`, `ALLOWED_SITE_ORIGINS`, flags cerrados y retención están configurados como variables no secretas;
- Zero Trust/Access continúa ausente y se conserva sólo como fallback interno opcional;
- producción y preview usan `Fail closed`;
- existe además un Worker independiente llamado `shekinah`, sin bindings ni variables, que no es el proyecto Pages conectado a `JerePrograma/shekinah`.

Los flags server-side permanecen cerrados por el comportamiento fail-closed del código ante variables ausentes. Los defaults públicos de WhatsApp y Link de Pago autorizados el 2026-08-10 son independientes de esos flags y no habilitan Checkout Pro.

## Arquitectura

- frontend: React, TypeScript estricto y Vite;
- servidor: Cloudflare Pages Functions;
- persistencia automatizada: Cloudflare D1;
- pagos automatizados: Mercado Pago Checkout Pro;
- fallback temporal: Link de Pago manual más WhatsApp;
- administración: credencial propia y sesión firmada; Cloudflare Access opcional como fallback interno;
- analítica: first-party basada en consentimiento.

Consultar:

- `docs/FULL_STACK_COMMERCE.md`;
- `docs/COMMERCE_OPERATIONS.md`;
- `docs/COMMERCE_DEPLOYMENT.md`;
- `docs/COMMERCE_INCIDENTS_AND_ROLLBACK.md`.

## Calidad

Entorno canónico:

- Node.js `24.18.0`;
- npm `>=11.0.0`;
- TypeScript estricto;
- ESLint;
- Vitest;
- Playwright;
- verificadores de catálogo, seguridad y automatización.

## Separación de estados

Toda continuidad debe distinguir:

1. código integrado;
2. validación local;
3. commit y push;
4. GitHub Actions;
5. deployment de Pages;
6. D1 y migraciones;
7. secretos y bindings;
8. activación de Checkout Pro productivo;
9. fallback manual público;
10. pruebas de humo.

Ninguna etapa demuestra automáticamente la siguiente.
