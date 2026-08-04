# Estado actual

Fecha de revisión: 2026-08-04.

Base de integración full-stack:

`884c9de407c079fcf0a834b50008286c7633ff02`

Este documento describe el candidato de código integrado en el checkout. Su publicación, despliegue, configuración externa y activación productiva requieren evidencias separadas.

## Producto

Shekinah conserva:

- 510 productos;
- 16 categorías;
- precios en ARS;
- activos locales autorizados.

El candidato incorpora:

- carrito persistente;
- Mercado Pago Checkout Pro por redirección;
- pedidos y consulta pública de estado;
- webhook de Mercado Pago;
- Cloudflare Pages Functions;
- migraciones aditivas de Cloudflare D1 para comercio, fulfillment y retención;
- administración preparada para Cloudflare Access;
- analítica first-party con consentimiento;
- exportaciones administrativas;
- eliminación de sesión analítica.

## Estado operativo

La presencia del código no implica activación productiva.

Hasta completar bindings, secretos, D1, Mercado Pago, Access, dominio, retención y autorizaciones:

- comercio deshabilitado;
- analítica deshabilitada;
- WhatsApp deshabilitado;
- administración no considerada productiva;
- webhook no considerado productivo.

## Estado externo verificado

Consulta autenticada realizada el 2026-08-04, sin registrar IDs de cuenta, IDs de recursos, correos ni secretos:

- el proyecto de Cloudflare Pages se llama exactamente `shekinah` y publica `shekinah-7dl.pages.dev`;
- la rama de producción es `main`, el build es `npm run build:pages`, la salida es `dist` y los deployments automáticos están habilitados;
- producción sirve el commit `884c9de407c079fcf0a834b50008286c7633ff02`;
- producción y preview no tienen variables, secretos ni bindings configurados;
- la cuenta no contiene bases D1;
- Zero Trust muestra el onboarding inicial: no existe todavía una organización ni una aplicación Access;
- preview es público y producción/preview usan `Fail open`;
- existe además un Worker independiente llamado `shekinah`, sin bindings ni variables, que no es el proyecto Pages conectado a `JerePrograma/shekinah`.

Los flags permanecen cerrados por el comportamiento fail-closed del código ante variables ausentes, no porque sus valores `false` estén cargados explícitamente en Pages.

## Arquitectura

- frontend: React, TypeScript estricto y Vite;
- servidor: Cloudflare Pages Functions;
- persistencia: Cloudflare D1;
- pagos: Mercado Pago Checkout Pro;
- administración: Cloudflare Access;
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
8. activación productiva;
9. pruebas de humo.

Ninguna etapa demuestra automáticamente la siguiente.
