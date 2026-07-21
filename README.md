# Shekinah

[![CI](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml/badge.svg)](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml)

Repositorio de migración de la representación pública recuperada desde WordPress hacia un snapshot estático desplegable en Cloudflare Pages.

## Estado real

- Rama operativa y de despliegue: `main`.
- Fuente de verdad para la captura: `C:\laburo\shekinah-wordpress-reference`.
- Destino: Cloudflare Pages, proyecto `shekinah`.
- Dominio estable: `https://shekinah-7dl.pages.dev`.
- Infraestructura de captura, verificación, CI y despliegue: versionada.
- Snapshot WordPress real: **todavía no versionado** mientras no existan `reference-snapshot/manifest.json` y `reference-snapshot/site/index.html`.
- La implementación Astro existente se conserva únicamente como referencia transitoria; `npm run build` ya no puede desplegarla como sustituto del snapshot recuperado.

La migración no está finalizada hasta publicar el snapshot, obtener CI verde, desplegar el mismo SHA y verificar producción.

## Arquitectura final

```text
WordPress restaurado localmente
  → scripts/Run-FullMigration.ps1
  → Chromium + WP-CLI
  → reference-snapshot/
  → commit en main
  → GitHub Actions CI
  → dist/
  → wrangler pages deploy
  → Cloudflare Pages
```

Producción no requiere WordPress, PHP, MariaDB, Docker, Hostinger ni Node.js.

## Requisitos locales de migración

- PowerShell 7.
- Docker Desktop con `docker compose`.
- Git.
- Node.js 24 o superior.
- npm 11 o superior.
- Restauración WordPress indicada en la documentación.

El script maestro intenta activar Node 24 mediante `nvm-windows` o instalar la versión LTS mediante `winget`, pero siempre vuelve a comprobar las versiones y se detiene si sigue activo Node 22.

## Flujo completo local

```powershell
Set-Location 'C:\laburo\shekinah'
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\Run-FullMigration.ps1 -Publish -WaitForRemote
```

El script lee `LOCAL_PORT` desde `C:\laburo\shekinah-wordpress-reference\.env`; no presupone el puerto 8081.

## Comandos npm

```bash
npm ci
npm run install:browsers
npm run capture:wordpress
npm run verify:snapshot:required
npm run build
npm run preview
npm run test:unit
npm run test:e2e
npm run test:fidelity
npm run audit:output
npm run audit:secrets
npm run verify
npm run deploy
```

`npm run build`, `npm run verify` y CI fallan deliberadamente si falta el snapshot real.

## Estructura relevante

```text
.github/workflows/                 CI y despliegue Pages
reference-snapshot/data/          inventarios públicos sanitizados
reference-snapshot/screenshots/   capturas de referencia
reference-snapshot/site/          raíz estática versionada
reference-snapshot/manifest.json  rutas, errores, tamaños y SHA-256
scripts/Run-FullMigration.ps1     orquestador local completo
scripts/wordpress-reference/      captura, build, servidor y verificación
tests/e2e/                        pruebas del snapshot estático
tests/fidelity/                   comparación contra WordPress local
docs/                             estado, operación, despliegue y rollback
```

## Límites y seguridad

No se versionan SQL, `.env`, `wp-config.php`, usuarios, correos privados, hashes, salts, tokens, sesiones, logs ni datos administrativos. Las rutas públicas `/wp-content/...` pueden conservarse cuando apuntan a archivos estáticos reales.

Cada archivo desplegable debe ser menor o igual a 25 MiB. El flujo también controla cantidad de archivos, integridad del manifiesto, sourcemaps, referencias rotas, endpoints dinámicos activos y posibles secretos.

## Documentación principal

- [Migración WordPress](docs/WORDPRESS-REFERENCE-MIGRATION.md)
- [Estado verificable](docs/MIGRATION-STATUS.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [GitHub Actions](docs/GITHUB-ACTIONS.md)
- [Cloudflare actual](docs/CLOUDFLARE-CURRENT-SETUP.md)
- [Rollback](docs/ROLLBACK.md)
- [Pruebas](docs/TEST-REPORT.md)
- [Verificación CI](docs/CI-VERIFICATION.md)
