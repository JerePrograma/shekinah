# Registro de reimplementación de Shekinah

Estado del documento: en curso
Fecha de última actualización: 2026-07-27
Rama de trabajo: `main`
Repositorio: `JerePrograma/shekinah`

## Propósito

Este documento registra de forma verificable el avance de la reimplementación actual de Shekinah. No afirma que el historial completo del repositorio esté libre de implementaciones anteriores ni que exista aislamiento jurídico absoluto. El historial Git se conserva y la sustitución se realiza mediante commits normales sobre `main`.

## Fuentes autorizadas

- Requisitos proporcionados para la reimplementación actual.
- Logo adjunto y validado durante esta ejecución.
- Datos comerciales que el usuario proporcione expresamente durante esta ejecución.
- Documentación oficial de las tecnologías autorizadas.
- Dependencias públicas declaradas y con licencia identificable.

La implementación anterior se inspecciona únicamente para inventariar, detectar riesgos y decidir qué retirar. No se utiliza como fuente de diseño, arquitectura, contenido o código nuevo.

## Recurso visual autorizado

- Nombre recibido: `Logo_shekinah(7).png`
- Nombre de destino: `logo-shekinah.png`
- Ruta prevista: `public/assets/logo-shekinah.png`
- Formato: PNG
- MIME: `image/png`
- Dimensiones: 383 × 383 px
- Tamaño: 105443 bytes
- Modo: RGBA
- Transparencia efectiva: ninguna; todos los píxeles son opacos
- SHA-256: `cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747`

## BLOQUE 0 — Verificación de requisitos y acceso remoto

Resultado: completado.

Se verificaron:

- identidad e integridad exacta del logo;
- acceso al repositorio `JerePrograma/shekinah`;
- rama predeterminada `main`;
- permisos administrativos y de escritura mediante GitHub;
- disponibilidad local autorizada para ejecutar validaciones en `C:\laburo\shekinah`;
- Node.js 24 como línea elegida para la nueva base.

No se modificó el repositorio durante este bloque.

## BLOQUE 1 — Auditoría remota e inventario

Resultado: completado con neutralización urgente de automatizaciones.

SHA base:

`d47db3c0b1a1e752230bb810073393b65fa394d0`

Se detectaron workflows capaces de:

- reaccionar a pushes e issues;
- reconstruir y ejecutar payloads codificados;
- crear commits;
- hacer push sobre `main`;
- desplegar la aplicación anterior;
- recuperar e importar datos externos de implementaciones previas.

Se eliminaron 11 workflows existentes para impedir modificaciones automáticas durante la sustitución.

Commit:

- Mensaje: `chore: neutralize legacy automation`
- SHA: `afae521d156feb2dead946f205e142a3a260d3a9`

La actualización fue fast-forward y no reescribió el historial.

## BLOQUE 2 — Sustitución del árbol y base técnica

Resultado actual: completado; la base técnica nueva fue publicada.

### Base candidata

Se preparó manualmente una base nueva con:

- React;
- React DOM;
- TypeScript estricto;
- Vite;
- ESLint;
- Vitest;
- React Testing Library;
- Playwright;
- verificación criptográfica del logo;
- scripts mínimos de desarrollo, build y validación;
- `package-lock.json` reproducible generado con npm 11.

No se incorporaron productos, contacto ni otros datos comerciales.

### Validación candidata v1

ZIP candidato:

`a16409f79b5f24d784f6c66d6535f95189076be57f171155c03f821bcefba820`

ZIP de resultados:

`5e550f613876f36a9b7a8d0c04af4740b6070a61f6cc655504152e964af29b42`

Entorno:

- Node.js `24.18.0`
- npm `11.16.0`

Resultado real: fallido.

Hallazgos:

1. `@testing-library/jest-dom` cargaba tipos de Jest en un proyecto configurado con Vitest.
2. `playwright.config.ts` asignaba `undefined` a `workers` con `exactOptionalPropertyTypes: true`.
3. El script de validación no comprobaba correctamente todos los códigos de salida de programas nativos y marcó el resultado como exitoso aunque `typecheck` había fallado.

Correcciones aplicadas al candidato siguiente:

- uso de `@testing-library/jest-dom/vitest`;
- propiedad `workers` agregada solo cuando existe CI;
- `reuseExistingServer: false`;
- wrapper PowerShell que comprueba explícitamente `$LASTEXITCODE`.

### Validación candidata v2

ZIP candidato:

`267d09df6935e5721bdc92c8ee2d8938ddb1c310a4496d32ea8ff0e061377037`

SHA-256 del lockfile:

`d9ee83f246dccfc14a704f0b2887b6057f99725eff001e32f120461fe217e7dc`

ZIP de resultados:

`e76ed32584fc3724d544cd3ceddce3b1a05d2acb7c42f3323cb414f1467acbda`

Resultado real: fallido.

Controles completados antes del fallo:

- `npm ci`: aprobado, 201 paquetes instalados;
- instalación de Chromium: aprobada;
- ESLint: aprobado;
- TypeScript: aprobado;
- prueba de componente `src/App.test.tsx`: aprobada.

Fallo:

Vitest utilizó su patrón de descubrimiento predeterminado y recogió también `tests/e2e/app.spec.ts`. Ese archivo pertenece a Playwright y no puede ejecutarse dentro del runtime de Vitest, por lo que la suite falló con `Playwright Test did not expect test() to be called here`.

Corrección aplicada en la candidata v3:

- Vitest queda limitado a `src/**/*.test.{ts,tsx}`;
- `tests/e2e/**` queda excluido expresamente del runner unitario;
- `tests/e2e/app.spec.ts` permanece bajo Playwright;
- el lockfile no cambia porque no se modificaron dependencias.

### Validación candidata v3

ZIP candidato:

`265036198ad60729e9241086c2a34b0c00fb8c765dc6539d1a51ecab83f8e91c`

ZIP de resultados informado:

`40be0f511f674c8edfb3d7fa721fd911f316573128ec17dd81ef208f95ce51cb`

Entorno:

- Node.js `24.18.0`
- npm `11.16.0`

Resultado real: fallido en el control final de formato Git.

Controles aprobados:

- `npm ci`: 201 paquetes instalados;
- instalación de Chromium;
- ESLint;
- TypeScript;
- Vitest: 1 archivo y 1 prueba aprobados;
- build de Vite;
- verificación del logo por ruta, dimensiones, tamaño y SHA-256;
- Playwright: 1 prueba aprobada sin errores de consola.

Resultado del build:

- `dist/index.html`: generado;
- CSS productivo: generado;
- JavaScript productivo: generado;
- compilación finalizada correctamente.

Fallo final:

`git diff --cached --check` detectó espacios al final de las líneas 3, 4 y 5 de `docs/REIMPLEMENTATION_PROGRESS.md`.

La aplicación, las pruebas y el build estaban correctos. El candidato no se publicó porque el diff no estaba limpio.

Corrección aplicada en la candidata v4:

- se eliminaron los tres espacios finales detectados;
- se mantuvo la separación Vitest/Playwright;
- no cambiaron dependencias, lockfile, código de producción ni bytes del logo;
- se añadió documentación detallada de las validaciones del BLOQUE 2;
- se debe validar el candidato exacto v4 antes de sustituir el árbol remoto.

### Validación candidata v4

Estado: preparada; validación local pendiente.

El SHA-256 del ZIP candidato y de los archivos corregidos se registra en el informe remoto que acompaña esta actualización y en `docs/validation/BLOCK_2_VALIDATIONS.md`.

### Estado de publicación

No se publicó ninguna versión candidata fallida. El árbol funcional anterior continúa presente temporalmente, pero sus workflows fueron neutralizados. La sustitución completa se hará solamente después de una validación íntegra y reproducible.

## Commits del registro de avance

- `c4898a9715469a061cfc8d83d66f5070183e84fa` — `docs: record reimplementation progress`
- `cfb3268331500bcd7fa8aab9fb51a080b5fc93df` — `docs: record third validation candidate`

El SHA del commit que incorpora esta actualización se informa en el reporte remoto y no se intenta autorreferenciar dentro del propio commit.

## Reglas de actualización de este registro

Este archivo debe actualizarse cuando ocurra cualquiera de los siguientes eventos:

- una validación candidata termina, sea exitosa o fallida;
- se corrige un error del candidato;
- se crea un commit del proceso;
- se sustituye el árbol;
- se ejecutan pruebas adicionales;
- cambia el SHA de `main`;
- aparece un bloqueo real.

Los resultados deben clasificarse como `verificado`, `revisado por código`, `no disponible` o `fallido`. No se debe presentar como aprobada una etapa que no haya terminado.

## Publicación definitiva del BLOQUE 2

Resultado: verificado y publicado.

- SHA remoto previo: `7e39c5535800fdda31a48846f977fe5c1c05eb3f`
- ZIP candidato: `ab4080dc01c0ced0cc7be9b29ca6fa3dc3cd75fcf4230b621f6d7a67bbe567fa`
- ZIP de resultados: `bb61e9a685533c4fe19fe7588bbce7f3fe35c1d3cf62c9d4a4545aac97e3ac53`
- Node.js: `24.18.0`
- npm: `11.16.0`
- `npm ci`: aprobado
- `npm run verify`: aprobado
- `git diff --cached --check`: aprobado
- `npm ls --depth=0`: aprobado
- commit de sustitución: `45af35eedfcc9fc4629b70fc5380cf0e70695d26`

La implementación anterior fue retirada del árbol actual mediante un commit normal. El historial Git anterior continúa conservado y accesible.

El transporte temporal mediante workflows fue cancelado antes de ejecutarse. Sus commits permanecen únicamente como evidencia histórica y el workflow temporal no forma parte del árbol final.
## BLOQUE 3 — Diseño visual y estructura principal

Resultado: verificado y publicado.

- SHA remoto previo: `59452200fc6bd7fea0f25f3f4035cef6decdd7c0`
- ZIP candidato: `11bd3139513a3750cc00b49760688f11cd68a2b04ff3705d7f766b54b223b790`
- ZIP de validación: `f1afe6d9e8e4c9238b9d3156910bfa7483a8cea6eeb17c3ca0e5bee23ac3c2bb`
- Node.js: `24.18.0`
- npm: `11.16.0`
- `npm ci`: aprobado
- `npm run verify`: aprobado
- ESLint: aprobado
- TypeScript: aprobado
- Vitest: 1 prueba aprobada
- build de Vite: aprobado
- verificación criptográfica del logo: aprobada
- Playwright: 2 pruebas aprobadas en Chromium
- revisión visual de escritorio y móvil: aprobada
- `git diff --cached --check`: aprobado
- commit funcional: `b8d65dd3988a5715603bb5540af13a51d8a9afab`
- push funcional: fast-forward a `origin/main`
- force-push: no utilizado

El bloque incorpora únicamente la estructura visual, el layout responsive, la navegación interna, el estado vacío del catálogo y su documentación. No incorpora productos, precios, contacto, recetas, blog, carrito, pagos, backend ni recursos visuales adicionales.
