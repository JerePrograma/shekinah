# Registro de reimplementación de Shekinah

Estado del documento: en curso
Fecha de última actualización: 2026-07-28
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
## BLOQUE 4 — Modelo comercial y catálogo

Resultado: verificado y publicado.

- SHA remoto previo: `2ed2241648bde43ce405f47ca27fc592813bcd86`
- ZIP candidato: `8dd069418f12ccfea2343a5eb7f6fb15b8f882d7eb64588121bf9746a3986bd5`
- ZIP de validación: `e7b666d57d2f4c415c49bb2ce6e9dfc5489e69654caf13475670c4656d7b80dd`
- script de validación: `1a08f572be4f9be5e835c6365ebe61601cf07245ad3536622e48c8da8a66f284`
- Node.js: `24.18.0`
- npm: `11.16.0`
- `npm ci`: aprobado
- `npm run verify`: aprobado
- ESLint: aprobado
- TypeScript: aprobado
- Vitest: 3 archivos y 14 pruebas aprobados
- build de Vite: aprobado
- verificación criptográfica del logo: aprobada
- Playwright: 2 pruebas aprobadas en Chromium
- revisión visual de escritorio y móvil: aprobada
- `git diff --cached --check`: aprobado
- commit funcional: `300e59de90539619b110499bcbad0ceb2c7722b9`
- push funcional: fast-forward a `origin/main`
- force-push: no utilizado

El bloque incorpora el modelo validado de producto, la fuente centralizada de datos comerciales autorizados, búsqueda normalizada, categorías derivadas, filtros combinables y presentación condicional del catálogo. La fuente pública permanece sin productos y el contacto permanece ausente. No se incorporaron datos comerciales ficticios, imágenes de producto, dependencias nuevas, backend, carrito ni pagos.
## BLOQUE 5 — Navegación, 404, seguridad y privacidad

Resultado: verificado y publicado.

- SHA remoto previo: `6ccae0839ab7c114eac7fee096c7aa7b7eb5b6f5`
- ZIP candidato: `867fba2e3e8f4f71b920343acef828bb701e3df9f1198372e1742ba998db3d8f`
- ZIP de validación: `711a8fd6eb92f27a32f80347fa0f44541efff4fa047d929dcd5d85fa7b216a53`
- script de validación: `f47ecf420c588a3c575b1ac0db62ff0d01becd504d3e649c7172210af29b28ef`
- intento de publicación v1: fallido antes de sincronizar o modificar Git
- ZIP de resultado fallido v1: `a3df0927340060ed281c44cc92e3ccb44b8e374ba1571bf8e789040725209b6d`
- causa del fallo v1: prechequeo buscaba literales `path` que el candidato representa mediante `appPaths`
- intento de publicación v2: fallido durante la revalidación limpia, antes de aplicar archivos, crear commits o hacer push
- ZIP de resultado fallido v2: `bb7ee39840db14ae396041b511f143290018691603d1da8b820f93122881e100`
- causa del fallo v2: el auditor ejecutó `git ls-files` antes de inicializar el repositorio Git temporal
- intento de publicación v3: fallido durante la inspección de evidencia, antes de sincronizar o modificar Git
- ZIP de resultado fallido v3: `1fe15c9064b7770b4529c44acc949cdb99fb757375d3b33ba36f43368f8201c3`
- causa del fallo v3: el transcript de PowerShell no conservó el stderr nativo que el prechequeo exigía aunque el JSON estructurado ya acreditaba el fallo v2
- script de publicación v2: `bd9962128bf1646ddcb597fdd5b40a889e308b5c79756016e98fccc03ef7f17f`
- script de publicación v3: `88973b3e7be6c568cb24626408805d89ba31d3141cc7619919cd89f84603cd72`
- script de publicación v4: `8a495c347bacc85a464b63139e2f9b7d9162c1a029b9987ac395457a2301c233`
- Node.js: `24.18.0`
- npm: `11.16.0`
- `npm ci`: aprobado
- `npm run verify`: aprobado
- ESLint: aprobado
- TypeScript: aprobado
- Vitest: 4 archivos y 21 pruebas aprobados
- build de Vite: aprobado
- verificación criptográfica del logo: aprobada
- auditoría estática de seguridad: aprobada
- `public/_headers` y `dist/_headers`: idénticos y aprobados
- Playwright: 3 pruebas aprobadas en Chromium
- revisión visual de inicio, privacidad, 404 y móvil: aprobada
- `git diff --cached --check`: aprobado
- commit funcional: `5bc26706f5e971ae1bcb2c15ef46c1f6ed2b9bae`
- push funcional: fast-forward a `origin/main`
- force-push: no utilizado

El bloque incorpora navegación interna mediante History API, rutas directas, metadatos por vista, foco posterior a navegación, privacidad comprobable, vista 404 de aplicación y encabezados restrictivos para Cloudflare Pages. La fuente pública permanece sin productos y el contacto permanece ausente. No se incorporaron dependencias, backend, formularios, analítica, trackers, recursos externos ni secretos.
## BLOQUE 6 — CI, Cloudflare Pages y documentación operativa

Resultado: validado y publicado; registro documental recuperado después de un fallo de orquestación posterior al push funcional.

### Alcance publicado

- workflow CI único y de solo lectura;
- Node.js `24.18.0` fijado en `.node-version`;
- instalación reproducible con `npm ci`;
- Chromium con dependencias del sistema en CI;
- ejecución de `npm run verify`;
- artefacto efímero limitado a `dist`;
- comando `npm run build:pages`;
- verificación estática de automatización;
- documentación de arquitectura, accesibilidad, procedencia, activos, despliegue y dependencias de terceros;
- preparación para Cloudflare Pages mediante integración Git, sin secretos de despliegue en el repositorio.

### Evidencia

- base remota validada: `5b9da6eba55bfbea437f29ca192f64982224303e`;
- ZIP candidato: `3ac28d6391b0aa7226c7fc38f829121ddb6d767daa9fab46f3c6d16bd446e3f8`;
- ZIP de validación: `8f8f78748e76005ce1e8196e63d4b3470945bba078fc123cc5e99a30d64baf90`;
- commit funcional: `d39fd3d03a4dd7fe34636e58ff7bf969d98c37be`;
- validación completa: aprobada;
- Vitest: 21 pruebas aprobadas;
- Playwright: 3 pruebas aprobadas;
- build para Pages: aprobado;
- push funcional: fast-forward;
- force-push: no utilizado.

### Incidente de registro

El script de publicación falló en `REGISTRAR PUBLICACIÓN`, después del push funcional, porque su parámetro obligatorio `Lines` no admitía las líneas vacías válidas del Markdown.

Antes del fallo había modificado localmente los documentos de plan y validación. La recuperación preservó esos archivos y su diff antes de reconstruir el registro desde el commit funcional.

- resultado fallido preservado: `shekinah-block6-publication-result-v2.zip`;
- SHA-256: `a17d3af9f0651d046954336ec27f44d48d88c1b93265abdb75614b9c6e0f3e66`;
- respaldo parcial: `shekinah-block6-partial-local-backup-20260728-150448.zip`;
- SHA-256 del respaldo parcial: `60b8155d4444ec103834bfb78410355bd6d05b069231d5d9159c7d673fa8076f`;
- impacto: no se creó el commit documental previsto;
- impacto funcional: ninguno;
- recuperación: commit documental posterior, limitado a los archivos de registro.

## Incorporación integral del catálogo histórico

Resultado de implementación: catálogo histórico integrado y validado localmente sobre la arquitectura React/TypeScript/Vite vigente.

### Fuente y alcance

- base de implementación: `2ff352a350097b40403543ef2490857f9043ebf6`;
- revisión histórica elegida: `7e39c5535800fdda31a48846f977fe5c1c05eb3f`;
- blob de productos: `e224b0ff241547a038f53c84bb006ef7cf3e56bb`;
- blob de categorías: `1649e6c27d92d1e26a45408c54bb8f499a023d64`;
- tree de imágenes: `9015d8a4ca17410c423ec50633d031f61695b385`;
- captura comercial: 2026-07-23;
- 510 productos, 16 categorías y 510 precios ARS;
- 495 descripciones completas y 432 SKU;
- 509 referencias y 484 imágenes únicas;
- un producto sin imagen y 15 sin descripción completa;
- cero slugs, paths o IDs históricos duplicados;
- cero categorías o imágenes referenciadas sin resolver.

### Implementación actual

- índice público liviano para catálogo y rutas;
- detalle local diferido mediante `import()` estático de Vite;
- sanitización offline determinista sin descargas;
- búsqueda sin distinción de mayúsculas o tildes y tolerante a espacios;
- filtros por categoría y paginación de 24 productos;
- 510 fichas y 16 rutas históricas de categoría;
- advertencias comercial y sanitaria visibles;
- allowlist exacta de logo e imágenes comerciales;
- CSP restrictiva, sin conexiones remotas ni HTML histórico;
- 31 pruebas Vitest y 5 escenarios Playwright sobre el build compilado;
- validadores de datos, activos, seguridad y automatización integrados a los comandos canónicos.

No se restauraron componentes, estilos, checkout, workflows ni código legacy. El contacto permanece en `null` y no se incorporaron datos comerciales inventados.
