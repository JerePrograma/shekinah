# Automatización y despliegue del BLOQUE 6

## Objetivo

Incorporar una cadena de integración continua mínima, reproducible y sin privilegios, además de documentación operativa suficiente para configurar Cloudflare Pages sin inventar un estado de despliegue.

## Workflow CI

Archivo: `.github/workflows/ci.yml`.

Propiedades:

- eventos: push a `main`, pull request y ejecución manual;
- permisos: `contents: read`;
- runner: `ubuntu-latest`;
- tiempo máximo: 20 minutos;
- concurrencia por workflow y referencia;
- checkout sin persistencia de credenciales;
- Node.js leído desde `.node-version`;
- instalación mediante `npm ci`;
- Chromium con dependencias del sistema;
- validación mediante `npm run verify`;
- artefacto limitado a `dist`;
- retención de siete días.

Acciones fijadas:

- `actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd`;
- `actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238`;
- `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`.

## Separación entre CI y despliegue

El workflow no despliega. Esta decisión evita permisos de escritura, secretos de Cloudflare y duplicación de builds mientras el modo real del proyecto Pages no esté verificado.

Cloudflare Pages debe usar integración Git y construir `main` con:

- `npm run build:pages`;
- salida `dist`;
- Node.js `24.18.0`.

## Scripts

`build:pages` ejecuta verificaciones que no requieren navegador E2E y genera `dist`.

`verify:automation` inspecciona:

- versión de Node.js;
- scripts;
- cantidad de workflows;
- acciones permitidas;
- SHAs fijados;
- permisos;
- orden de pasos;
- comandos prohibidos;
- documentación obligatoria;
- afirmaciones de despliegue no verificadas.

`verify` conserva la validación completa e incorpora `verify:automation` antes de Playwright.

## Sin cambios de producto

Este bloque no modifica componentes, rutas, estilos, contenido público, catálogo, productos, contacto ni activos.
