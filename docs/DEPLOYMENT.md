# Despliegue en Cloudflare Pages

Fecha de actualización: **2026-07-22**.

## Configuración

- Proyecto Pages: `shekinah`.
- Rama de producción: `main`.
- Directorio: `dist/`.
- Dominio estable: `https://shekinah-7dl.pages.dev`.
- Publicador: GitHub Actions mediante el binario versionado de Wrangler.
- Workers Builds nativo: sin triggers vinculados al recurso `shekinah`.

## Fuente única de publicación

GitHub Actions es el único publicador habilitado. El 22 de julio de 2026 se eliminaron mediante la API de Cloudflare los dos triggers heredados de Workers Builds:

- `Deploy default branch` (`ba10d5f5-45b7-4881-a28f-58be738389d0`), que ejecutaba `npm run build` y `npx wrangler deploy` sobre `main`;
- `Deploy non-production branches` (`0b92afd0-2a77-4b5c-bf87-d409b781d52e`), que ejecutaba `npm run build` y `npx wrangler versions upload` sobre ramas no productivas.

La eliminación de esos triggers no ejecutó builds ni despliegues y no modificó el proyecto Cloudflare Pages. No deben recrearse mientras `.github/workflows/deploy-cloudflare.yml` continúe siendo el flujo oficial.

## Flujo

1. Un commit llega a `main`.
2. CI instala, analiza, construye, prerenderiza y prueba la aplicación.
3. Solo un CI exitoso dispara el workflow de despliegue.
4. El deploy vuelve a ejecutar `npm run verify` sobre el SHA validado.
5. Wrangler publica `dist` con el hash del commit.
6. Se ejecutan pruebas HTTP y semánticas sobre el deployment y el dominio estable.

## Variables protegidas

Configurar en GitHub Actions:

- `CLOUDFLARE_API_TOKEN` con permiso para desplegar Pages.
- `CLOUDFLARE_ACCOUNT_ID` de la cuenta propietaria del proyecto.

No crear `.env` para este flujo ni versionar credenciales.

Los tokens temporales utilizados para administrar Workers Builds deben eliminarse después de la operación. No deben reutilizarse como secretos de despliegue.

## Construcción local reproducible

```bash
npm install --package-lock=false --no-audit --no-fund
npm run install:browsers
npm run verify
```

El resultado desplegable queda en `dist/`. No se requiere WordPress, Docker, PHP, MariaDB ni acceso a una computadora específica.
