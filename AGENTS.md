# Instrucciones para agentes

## Alcance

Este archivo rige todo el repositorio `JerePrograma/shekinah`.

El repositorio, su historial, sus pruebas y su configuración son la única fuente de verdad. No completar huecos con recuerdos, conversaciones anteriores ni supuestos.

## Orden de lectura

Antes de editar:

1. `docs/CODEX_AUTORREFERENCIA.md`;
2. `README.md`;
3. `docs/CURRENT_STATE.md`;
4. `docs/CONTINUATION.md`;
5. `docs/ARCHITECTURE.md`;
6. `docs/FULL_STACK_COMMERCE.md`;
7. `docs/FULFILLMENT_AND_RETENTION.md`;
8. `docs/COMMERCE_OPERATIONS.md`;
9. `docs/COMMERCE_DEPLOYMENT.md`;
10. `docs/COMMERCE_INCIDENTS_AND_ROLLBACK.md`;
11. `docs/PROVENANCE.md`;
12. `docs/AUTHORIZED_ASSETS.md`;
13. `docs/ACCESSIBILITY.md`;
14. `docs/DEPLOYMENT.md`;
15. documentos pertinentes de `docs/design/` y `docs/validation/`.

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
- Las capacidades de servidor se implementan con Cloudflare Pages Functions y D1; no se requiere un VPS para la arquitectura prevista.
- El catálogo canónico conserva 510 productos y 16 categorías.
- No inventar productos, precios, stock, contacto, horarios, redes, promociones, testimonios, certificaciones ni afirmaciones sanitarias.
- En Checkout Pro integrado, el navegador no decide precios, moneda, totales ni estados de pago; el servidor recalcula y el webhook verifica al proveedor.
- El fallback manual temporal puede mostrar y copiar el total del carrito únicamente como importe que el comprador ingresa en un Link de Pago sin monto predefinido. Ese total no crea un pedido, no prueba un cobro y debe asociarse/verificarse manualmente antes de fulfillment.
- Mercado Pago Checkout Pro se integra por redirección; el webhook consulta información autoritativa del proveedor.
- Las operaciones administrativas se protegen con Cloudflare Access y validación interna del JWT.
- La analítica first-party requiere consentimiento y una retención expresamente autorizada.
- Checkout Pro automatizado y analítica permanecen deshabilitados hasta completar configuración y autorizaciones.
- WhatsApp sólo puede habilitarse con un número autorizado. El número `5492236216559` quedó autorizado explícitamente el 2026-08-10 para el fallback manual actual.
- El Link de Pago manual sólo puede usar una URL pública expresamente autorizada y permitida por la verificación de seguridad; el valor actual es `https://link.mercadopago.com.ar/shekinahmoreno`.
- No exponer secretos mediante Git, logs, respuestas, bundles ni variables `VITE_*`.
- No agregar parámetros no documentados al Link de Pago para simular un monto precargado.
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
- ausencia de secretos y datos personales no autorizados;
- ausencia de binarios no autorizados;
- ausencia de `dist` y artefactos temporales;
- enlaces y rutas documentales válidos;
- coherencia entre código, pruebas y documentación.

No declarar una validación aprobada si no fue ejecutada. Clasificar cada control como `verificado`, `revisado por código`, `no disponible` o `fallido`.

## CI y despliegue

`.github/workflows/ci.yml` mantiene permisos `contents: read` y validación de solo lectura.

La publicación de Cloudflare Pages usa integración Git y puede incluir Pages Functions. Un push a `main` no demuestra por sí solo que producción esté actualizada ni que D1, secretos, Mercado Pago Checkout Pro, Access o flags estén configurados.

Registrar por separado:

- SHA validado por CI;
- conclusión y jobs de la ejecución;
- artefacto generado;
- SHA desplegado por Cloudflare;
- estado del fallback manual público;
- bindings y migraciones;
- configuración externa;
- activación productiva de Checkout Pro;
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
