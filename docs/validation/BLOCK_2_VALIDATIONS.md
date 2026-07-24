# Validaciones del BLOQUE 2

## Alcance

Este documento registra los intentos de validación de la base técnica nueva de Shekinah antes de sustituir el árbol funcional de `main`.

La validación se ejecuta sobre candidatos empaquetados y verificados por SHA-256. Ningún candidato fallido se publica.

## Entorno utilizado

- Ruta de referencia del repositorio local: `C:\laburo\shekinah`
- Node.js: `24.18.0`
- npm: `11.16.0`
- Git para Windows: `2.48.1.windows.1`
- Navegador E2E: Chromium instalado mediante Playwright

## Candidata v1

### Integridad

- ZIP candidato: `a16409f79b5f24d784f6c66d6535f95189076be57f171155c03f821bcefba820`
- ZIP de resultados: `5e550f613876f36a9b7a8d0c04af4740b6070a61f6cc655504152e964af29b42`

### Resultado

Fallido.

### Hallazgos

- configuración incorrecta de tipos de `jest-dom`;
- propiedad opcional de Playwright incompatible con `exactOptionalPropertyTypes`;
- validación PowerShell que no detenía correctamente programas nativos con código distinto de cero.

## Candidata v2

### Integridad

- ZIP candidato: `267d09df6935e5721bdc92c8ee2d8938ddb1c310a4496d32ea8ff0e061377037`
- lockfile: `d9ee83f246dccfc14a704f0b2887b6057f99725eff001e32f120461fe217e7dc`
- ZIP de resultados: `e76ed32584fc3724d544cd3ceddce3b1a05d2acb7c42f3323cb414f1467acbda`

### Resultado

Fallido.

### Controles aprobados

- instalación reproducible;
- Chromium;
- lint;
- TypeScript;
- prueba de componente.

### Fallo

Vitest descubrió por defecto el archivo E2E de Playwright.

### Corrección

Se configuraron patrones separados:

- Vitest: `src/**/*.test.{ts,tsx}`;
- exclusión unitaria: `tests/e2e/**`;
- Playwright: `tests/e2e/app.spec.ts`.

## Candidata v3

### Integridad

- ZIP candidato: `265036198ad60729e9241086c2a34b0c00fb8c765dc6539d1a51ecab83f8e91c`
- ZIP de resultados informado: `40be0f511f674c8edfb3d7fa721fd911f316573128ec17dd81ef208f95ce51cb`

### Resultado

Fallido únicamente en `git diff --cached --check`.

### Controles aprobados

- `npm ci`;
- instalación de Chromium;
- `npm run lint`;
- `npm run typecheck`;
- `npm run test`;
- `npm run build`;
- `npm run verify:assets`;
- `npm run test:e2e`.

### Evidencia funcional

- Vitest: 1 prueba aprobada;
- Vite: build generado correctamente;
- logo: PNG 383 × 383, 105443 bytes y SHA-256 autorizado;
- Playwright: 1 prueba aprobada en Chromium;
- consola del navegador: sin errores detectados por la prueba.

### Fallo

Tres líneas del registro de progreso tenían espacios finales:

- línea 3;
- línea 4;
- línea 5.

### Corrección

Se eliminaron únicamente esos espacios finales. No se modificaron dependencias, lockfile, código de producción, pruebas ni logo.

## Candidata v4

Estado: preparada y pendiente de validación local completa.

Integridad:

- ZIP candidato: `ab4080dc01c0ced0cc7be9b29ca6fa3dc3cd75fcf4230b621f6d7a67bbe567fa`;
- logo: `cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747`;
- lockfile: `d9ee83f246dccfc14a704f0b2887b6057f99725eff001e32f120461fe217e7dc`;
- `vitest.config.ts`: `8d83d602ff000af87287049bc469b48dd514a5fe3b6f52cc7290152fb5c4d41d`;
- registro principal: `0b83ff4c61f55f3424ba9dcbba68b31a465c9c230eaaf94db629b4b43dcd5008`;
- este documento: `a7e6f2835b347d017aef2a2a3b06f7b55329d265219df1c11a77ff26ac971063`.

Criterios de aceptación:

1. hashes del ZIP, logo, lockfile, configuración Vitest y documentación coincidentes;
2. `npm ci` correcto;
3. `npm run verify` completo;
4. `git diff --cached --check` sin salida ni errores;
5. `npm ls --depth=0` correcto;
6. resultado final `SUCCESS`.

## Regla de publicación

La sustitución del árbol remoto se realizará únicamente cuando todos los criterios de la candidata exacta resulten aprobados.
