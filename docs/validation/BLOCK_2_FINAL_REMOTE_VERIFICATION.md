# Verificación remota final del BLOQUE 2

Fecha de verificación: 2026-07-27
Rama verificada: `main`

## Resultado

Estado: completado y verificado.

La candidata v4 fue validada localmente y publicada mediante dos commits normales, sin force-push ni reescritura de historial:

- sustitución del árbol: `45af35eedfcc9fc4629b70fc5380cf0e70695d26`;
- documentación de cierre: `b930c31605646d39fca2bc0bfe26560c15b25a6f`.

## Controles ejecutados

- Node.js `24.18.0`;
- npm `11.16.0`;
- `npm ci`: aprobado;
- `npm run lint`: aprobado;
- `npm run typecheck`: aprobado;
- Vitest: 1 prueba aprobada;
- build de Vite: aprobado;
- verificación del logo: aprobada;
- Playwright en Chromium: 1 prueba aprobada y sin errores de consola;
- `git diff --cached --check`: aprobado;
- `npm ls --depth=0`: aprobado.

## Árbol publicado

El árbol actual contiene la base nueva React/TypeScript/Vite, el lockfile reproducible, las configuraciones de calidad, las pruebas mínimas y el logo autorizado en `public/assets/logo-shekinah.png`.

La implementación heredada, los catálogos recuperados, las imágenes históricas, los scripts de recuperación, los payloads de finalización y la configuración Dependabot anterior fueron retirados de `main` mediante el commit de sustitución.

## Integridad del logo

- formato: PNG;
- dimensiones: 383 × 383 px;
- tamaño: 105443 bytes;
- SHA-256: `cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747`.

## Estado local informado

Al terminar la publicación, `main` y `origin/main` coincidían en `b930c31605646d39fca2bc0bfe26560c15b25a6f`.

Los ZIP, resultados de validación y scripts PowerShell permanecieron como archivos locales no rastreados. No forman parte del repositorio remoto.

## Observaciones

Durante el `fetch` se observaron ramas remotas de Dependabot ya existentes. No se modificaron ni se eliminaron porque están fuera del alcance de la sustitución de `main` y una eliminación de ramas requiere una decisión separada.

Las secciones históricas que describen candidatas fallidas se conservan como evidencia. La sección de publicación definitiva y este documento representan el estado vigente del BLOQUE 2.
