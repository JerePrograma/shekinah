# Despliegue en Cloudflare Pages

Fecha de actualización: **2026-07-23**.

## Configuración

- Repositorio: `JerePrograma/shekinah`.
- Rama de producción: `main`.
- Directorio generado: `dist/`.
- URL: `https://shekinah-7dl.pages.dev/`.
- Publicador: integración de Cloudflare Pages con GitHub.
- Comando de build: `npm run build`.
- Directorio de salida: `dist`.

## Flujo

1. Un commit llega a `main`.
2. GitHub Actions instala dependencias y ejecuta lint, formato, validación de contenido, build, pruebas y auditorías.
3. Cloudflare Pages detecta el mismo commit mediante la integración con GitHub.
4. Cloudflare ejecuta el build con la raíz `/` y publica `dist/`.
5. El trabajo `verify-production` consulta el dominio productivo hasta confirmar que el deployment esperado está disponible.
6. La verificación comprueba rutas principales, canonicals, sitemap, robots y ausencia de rastros técnicos.

No hay un segundo despliegue desde GitHub Actions. Esto evita dos proveedores publicando artefactos diferentes para la misma rama.

## Construcción local

Construcción normal:

```bash
npm install --package-lock=false --no-audit --no-fund
npm run install:browsers
npm run verify
```

Construcción equivalente a producción:

```bash
SITE_BASE_PATH=/ SITE_ORIGIN=https://shekinah-7dl.pages.dev npm run build
SITE_BASE_PATH=/ SITE_ORIGIN=https://shekinah-7dl.pages.dev npm run audit:output
SITE_BASE_PATH=/ SITE_ORIGIN=https://shekinah-7dl.pages.dev npm run audit:copy
```

## Requisitos de Cloudflare Pages

El proyecto `shekinah` debe permanecer conectado al repositorio `JerePrograma/shekinah`, rama `main`, con `npm run build` como comando de construcción y `dist` como directorio de salida.

No deben configurarse variables `SITE_BASE_PATH` con una subruta. El sitio se publica desde la raíz del dominio `pages.dev`.

## Verificación

El workflow `.github/workflows/ci.yml` no necesita credenciales de Cloudflare. Tras validar el commit, espera el deployment creado por la integración nativa y publica el estado `shekinah/cloudflare-pages` sobre el SHA correspondiente.
