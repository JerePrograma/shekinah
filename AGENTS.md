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
5. `docs/PROVENANCE.md`;
6. `docs/AUTHORIZED_ASSETS.md`;
7. `docs/ACCESSIBILITY.md`;
8. `docs/DEPLOYMENT.md`;
9. `docs/REIMPLEMENTATION_PROGRESS.md`;
10. documentos pertinentes de `docs/design/` y `docs/validation/`.

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

Si el entorno no permite un checkout local, registrar la limitación y utilizar únicamente operaciones remotas que preserven fast-forward e historial. No afirmar que se ejecutaron comandos locales que no se ejecutaron.

## Invariantes del producto

- SPA estática construida con React, TypeScript estricto y Vite.
- Sin backend, base de datos, autenticación ni peticiones a APIs.
- Navegación mediante History API sin dependencia externa de routing.
- Rutas públicas: `/`, `/enfoque`, `/catalogo` y `/privacidad`.
- Las demás rutas muestran la vista 404 de la aplicación.
- La fuente comercial única es `src/data/authorized-commercial-data.ts`.
- La colección pública de productos puede y actualmente debe permanecer vacía.
- El contacto autorizado puede y actualmente debe permanecer en `null`.
- No inventar productos, precios, contacto, horarios, redes, promociones, testimonios, certificaciones ni afirmaciones sanitarias.
- No reincorporar recetas.
- El único activo visual autorizado es `public/assets/logo-shekinah.png`.
- No añadir recursos remotos, analítica, trackers, iframes, fuentes externas ni imágenes adicionales sin autorización y actualización deliberada de verificadores.
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

No crear un nuevo bloque funcional por numeración. Derivar su objetivo de evidencia real del repositorio.

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
- ausencia de cambios accidentales en `package-lock.json`;
- ausencia de secretos y datos personales;
- ausencia de binarios no autorizados;
- ausencia de `dist` y artefactos temporales;
- enlaces y rutas documentales válidos;
- coherencia entre código, pruebas y documentación.

No declarar una validación aprobada si no fue ejecutada. Clasificar cada control como `verificado`, `revisado por código`, `no disponible` o `fallido`.

## CI y despliegue

`.github/workflows/ci.yml` es integración continua de solo lectura. No añadir permisos de escritura, secretos, Wrangler, acciones de Cloudflare ni despliegue desde GitHub Actions sin verificar primero la modalidad real del proyecto.

La estrategia documentada para Cloudflare Pages es integración Git. Un push a `main` no demuestra por sí solo que producción esté actualizada. Registrar por separado:

- SHA validado por CI;
- conclusión y jobs de la ejecución;
- artefacto generado;
- SHA desplegado por Cloudflare;
- rutas y encabezados comprobados;
- límites de la evidencia disponible.

## Cierre obligatorio

El informe de una implementación debe incluir:

- resumen del resultado;
- estado inicial y SHA base;
- archivos modificados;
- comportamiento cambiado y comportamiento preservado;
- pruebas y comandos ejecutados con resultado;
- estado de CI y despliegue;
- commits creados;
- push y SHA final de `origin/main`;
- pendientes e incidencias reales;
- confirmación de que no se utilizó force-push.
