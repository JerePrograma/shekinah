# Instrucciones para agentes

## Alcance

Este archivo rige todo el repositorio `JerePrograma/shekinah`.

El repositorio, su historial, sus pruebas y su configuración son la única fuente de verdad. No completar huecos con recuerdos, conversaciones anteriores ni supuestos.

## Orden de lectura

Antes de editar:

1. `README.md`;
2. `docs/CURRENT_STATE.md`;
3. `docs/CONTINUATION.md`;
4. `docs/ARCHITECTURE.md`;
5. `docs/FULL_STACK_COMMERCE.md`;
6. `docs/COMMERCE_OPERATIONS.md`;
7. `docs/COMMERCE_DEPLOYMENT.md`;
8. `docs/COMMERCE_INCIDENTS_AND_ROLLBACK.md`;
9. `docs/PROVENANCE.md`;
10. `docs/AUTHORIZED_ASSETS.md`;
11. `docs/ACCESSIBILITY.md`;
12. `docs/DEPLOYMENT.md`;
13. documentos pertinentes de `docs/design/` y `docs/validation/`.

Los archivos de `docs/validation/` son registros históricos. Preservar intentos fallidos, causas, hashes y secuencias aunque una sección posterior documente el cierre exitoso.

## Flujo Git obligatorio

Trabajar directamente sobre `main` y `origin/main`.

Antes de modificar:

```bash
git status
git switch main
git fetch origin
git pull --ff-only origin main
git status
git log --oneline --decorate -n 20
```

Reglas:

- no crear ramas, pull requests, worktrees ni stashes sin petición expresa;
- no usar `git reset --hard`, `git clean -fd`, rebase destructivo ni force-push;
- no sobrescribir ni eliminar cambios locales ajenos;
- no commitear `dist`, ZIP, resultados temporales, capturas, credenciales ni secretos;
- revisar el diff completo antes de preparar archivos;
- preparar rutas explícitamente;
- crear commits claros y atómicos;
- publicar con `git push origin main`;
- comprobar el SHA final de `origin/main`.

## Invariantes del producto

- Aplicación React, TypeScript estricto y Vite desplegada en Cloudflare Pages.
- La interfaz pública conserva la SPA y la navegación mediante History API.
- Las capacidades de servidor se implementan con Cloudflare Pages Functions y D1.
- El catálogo canónico conserva 510 productos y 16 categorías.
- No inventar productos, precios, stock, contacto, horarios, redes, promociones, testimonios, certificaciones ni afirmaciones sanitarias.
- El navegador no decide precios, moneda, totales ni estados de pago.
- Mercado Pago Checkout Pro se integra por redirección; el webhook consulta información autoritativa del proveedor.
- Las operaciones administrativas se protegen con Cloudflare Access y validación interna del JWT.
- La analítica first-party requiere consentimiento y una retención expresamente autorizada.
- Comercio, analítica y WhatsApp permanecen deshabilitados hasta completar configuración y autorizaciones.
- No exponer secretos mediante Git, logs, respuestas, bundles ni variables `VITE_*`.
- WhatsApp sólo puede habilitarse con un número autorizado.
- No reincorporar recetas.
- Los activos visuales autorizados siguen limitados al inventario del repositorio.
- El historial anterior se conserva; no afirmar que fue eliminado.

## Política de cambios

Antes de proponer o modificar código:

- localizar archivos, símbolos, usos, pruebas y contratos reales;
- leer contexto suficiente;
- determinar el comportamiento actual y el esperado;
- buscar regresiones, TODO verificables, issues vigentes y requisitos explícitos;
- aplicar el cambio mínimo necesario;
- evitar refactorizaciones, renombrados, formateos globales y dependencias nuevas no solicitadas;
- conservar firmas, tipos, rutas e interfaces públicas salvo necesidad demostrable;
- añadir o ajustar pruebas cuando cambie comportamiento.

## Contrato de validación

Usar Node.js indicado en `.node-version` y npm compatible con `package.json`.

Para un cambio publicable:

```bash
npm ci
npm run install:browsers
npm run verify
npm run build:pages
git diff --check
git diff --cached --check
```

Revisar además:

- lista exacta de archivos modificados;
- coherencia deliberada de `package-lock.json`;
- ausencia de secretos y datos personales;
- ausencia de binarios no autorizados;
- ausencia de `dist` y artefactos temporales;
- enlaces y rutas documentales válidos;
- coherencia entre código, pruebas y documentación.

No declarar una validación aprobada si no fue ejecutada. Clasificar cada control como `verificado`, `revisado por código`, `no disponible` o `fallido`.

## CI y despliegue

`.github/workflows/ci.yml` mantiene permisos `contents: read` y validación de solo lectura.

La publicación de Cloudflare Pages usa integración Git y puede incluir Pages Functions. Un push a `main` no demuestra por sí solo que producción esté actualizada ni que D1, secretos, Mercado Pago, Access o flags estén configurados.

Registrar por separado:

- SHA validado por CI;
- conclusión y jobs de la ejecución;
- artefacto generado;
- SHA desplegado por Cloudflare;
- bindings y migraciones;
- configuración externa;
- activación productiva;
- pruebas de humo.

## Cierre obligatorio

El informe debe incluir:

- resumen del resultado;
- estado inicial y SHA base;
- archivos modificados;
- comportamiento cambiado y preservado;
- pruebas ejecutadas y resultados;
- estado de CI y despliegue;
- commits creados;
- push y SHA final de `origin/main`;
- pendientes e incidencias reales;
- confirmación de ausencia de force-push.