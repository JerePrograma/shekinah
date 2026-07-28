# Avisos de terceros

## Alcance

Este documento enumera dependencias directas declaradas por el proyecto. Las versiones exactas se encuentran en `package.json`; el árbol transitivo completo está bloqueado en `package-lock.json`.

## Producción

- `react` — MIT;
- `react-dom` — MIT.

## Desarrollo y validación

- `@eslint/js` — MIT;
- `@playwright/test` — Apache-2.0;
- `@testing-library/dom` — MIT;
- `@testing-library/jest-dom` — MIT;
- `@testing-library/react` — MIT;
- `@types/node` — MIT;
- `@types/react` — MIT;
- `@types/react-dom` — MIT;
- `@vitejs/plugin-react` — MIT;
- `eslint` — MIT;
- `globals` — MIT;
- `jsdom` — MIT;
- `typescript` — Apache-2.0;
- `typescript-eslint` — MIT;
- `vite` — MIT;
- `vitest` — MIT.

## GitHub Actions

El workflow CI usa acciones oficiales de GitHub fijadas a commits completos:

- `actions/checkout`;
- `actions/setup-node`;
- `actions/upload-artifact`.

Estas acciones no forman parte del bundle web. Sus licencias y avisos permanecen en sus repositorios oficiales.

## Obligación de actualización

Al modificar dependencias se debe:

1. revisar la licencia declarada;
2. actualizar este documento;
3. regenerar `package-lock.json` únicamente mediante npm;
4. ejecutar `npm run verify`;
5. revisar el diff para impedir cambios transitivos accidentales.
