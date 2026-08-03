# Estado actual

Fecha de revisión: 2026-07-31.

Base de integración full-stack:

`3b47b691e4b6d799a127678a892d44b0e475ab6d`

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
- migración inicial de Cloudflare D1;
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