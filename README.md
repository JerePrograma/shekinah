# Shekinah

Aplicación web estática de **Shekinah, hierbas y especias**, reconstruida por bloques verificables.

## Estado actual

La aplicación incluye:

- interfaz responsive;
- navegación interna mediante History API;
- páginas de inicio, enfoque, catálogo y privacidad;
- vista 404 controlada por la aplicación;
- catálogo preparado para datos autorizados;
- encabezados de seguridad para Cloudflare Pages;
- pruebas unitarias, de componentes y E2E;
- integración continua de solo lectura.

Los productos autorizados permanecen vacíos y el contacto permanece ausente. No se publican datos comerciales ficticios.

## Requisitos

- Node.js `24.18.0`;
- npm `11` o superior;
- Chromium de Playwright para la validación completa.

La versión exacta de Node.js se registra en `.node-version`.

## Instalación

```bash
npm ci
```

## Desarrollo

```bash
npm run dev
```

## Validación completa

```bash
npm run install:browsers
npm run verify
```

En Linux CI, Chromium se instala con sus dependencias del sistema antes de ejecutar `npm run verify`.

## Build para Cloudflare Pages

```bash
npm run build:pages
```

El resultado queda en `dist`. Este comando ejecuta lint, tipos, pruebas unitarias, build y verificaciones de activos, seguridad y automatización. Las pruebas E2E se ejecutan en GitHub Actions mediante `npm run verify`.

## Arquitectura y operación

- [Procedencia](docs/PROVENANCE.md)
- [Activos autorizados](docs/AUTHORIZED_ASSETS.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Accesibilidad](docs/ACCESSIBILITY.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [Avisos de terceros](docs/THIRD_PARTY_NOTICES.md)

## Automatización

`.github/workflows/ci.yml` valida pushes a `main`, pull requests y ejecuciones manuales. El workflow no despliega, no usa secretos y solo dispone de permiso de lectura del repositorio.

Cloudflare Pages debe configurarse mediante integración Git usando `main`, `npm run build:pages` y `dist`. La conexión y el estado del despliegue se verifican fuera del repositorio, en el panel de Cloudflare.
