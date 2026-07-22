# Despliegue en Cloudflare Pages

Fecha de actualización: **2026-07-22**.

## Configuración

- Proyecto Pages: `shekinah`.
- Rama de producción: `main`.
- Directorio: `dist/`.
- Dominio estable: `https://shekinah-7dl.pages.dev`.
- Publicador: GitHub Actions mediante el binario versionado de Wrangler.

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

## Construcción local reproducible

```bash
npm install --package-lock=false --no-audit --no-fund
npm run install:browsers
npm run verify
```

El resultado desplegable queda en `dist/`. No se requiere WordPress, Docker, PHP, MariaDB ni acceso a una computadora específica.
