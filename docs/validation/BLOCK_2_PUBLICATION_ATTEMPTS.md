# Intentos de publicación del BLOQUE 2

## Resumen actual

Estado del BLOQUE 2: en curso.

- candidata v4: validada localmente con resultado `SUCCESS`;
- árbol funcional anterior: todavía presente en `main`;
- publicación de la base React: pendiente;
- intentos de publicación local: 4;
- commits de sustitución: ninguno;
- pushes de la base nueva: ninguno;
- último bloqueo: ESLint recorrió un directorio local no rastreado de resultados de validación y trató de analizar su `vitest.config.ts` fuera del proyecto TypeScript.

## Alcance

Este documento registra los intentos de publicación local de la candidata v4 ya validada antes de sustituir el árbol funcional de `main`.

## Intento 1 — 2026-07-26

### Estado inicial

- checkout local: `C:\laburo\shekinah`;
- rama solicitada: `main`;
- SHA remoto esperado: `9fc35f06aaf720a4e76462fe5120ac65cc116b6a`;
- ZIP candidato: `ab4080dc01c0ced0cc7be9b29ca6fa3dc3cd75fcf4230b621f6d7a67bbe567fa`;
- ZIP de resultados: `bb61e9a685533c4fe19fe7588bbce7f3fe35c1d3cf62c9d4a4545aac97e3ac53`.

### Trabajo realizado

El script verificó los dos archivos ZIP, comprobó que no hubiera cambios locales rastreados, ejecutó `git switch main`, `git fetch origin` y `git pull --ff-only origin main`.

El checkout local avanzó por fast-forward desde `228ae4e1f58aec270ba03bf6c7c9bd2b1d800794` hasta `9fc35f06aaf720a4e76462fe5120ac65cc116b6a`.

### Fallo

La ejecución se detuvo antes de extraer y revalidar la candidata. La función `Get-CheckedNativeOutput` devolvió una única línea como escalar de tipo `System.String`. La expresión posterior aplicó `[0]`, obteniendo un `System.Char`, y luego intentó invocar `.Trim()` sobre ese carácter.

Error observado:

```text
Error en la invocación del método porque [System.Char] no contiene ningún método llamado 'Trim'.
```

### Impacto

- no se ejecutó `git rm`;
- no se copiaron archivos de la candidata;
- no se modificó el árbol de trabajo rastreado;
- no se creó ningún commit local;
- no se hizo push;
- `origin/main` permaneció sin cambios en `9fc35f06aaf720a4e76462fe5120ac65cc116b6a`.

### Corrección seleccionada

Se separa la lectura escalar de la lectura multilínea:

- `Get-CheckedNativeScalar` exige exactamente una línea y devuelve un `string`;
- `Get-CheckedNativeOutput` continúa devolviendo colecciones para `git ls-files` y `git diff --name-only`;
- se eliminan los accesos `[0].Trim()` sobre resultados escalares.

## Intento 2 — 2026-07-26

### Qué funcionó

- se localizaron y verificaron los ZIP de candidata y resultados;
- se confirmó la existencia del checkout Git;
- no se detectaron cambios locales rastreados antes de sincronizar;
- `git switch main` finalizó correctamente;
- `git fetch origin` finalizó correctamente;
- `git pull --ff-only origin main` finalizó correctamente;
- la ejecución se detuvo antes de cualquier sustitución del árbol.

### Qué falló

Se ejecutó nuevamente el bloque PowerShell anterior pegado en consola, no el archivo corregido `shekinah-block2-publication-v2.ps1`.

El bloque ejecutado todavía contenía expresiones de esta forma:

```powershell
(
    Get-CheckedNativeOutput ...
)[0].Trim()
```

El error volvió a producirse al leer la rama:

```text
Method invocation failed because [System.Char] does not contain a method named 'Trim'.
```

### Impacto verificado

- no se extrajo ni revalidó la candidata;
- no se ejecutó `git rm`;
- no se copiaron archivos;
- no se alteró el índice;
- no se creó commit de sustitución;
- no se hizo push;
- no existe un estado parcial que deba revertirse.

### Corrección seleccionada

La siguiente ejecución debe realizarse únicamente desde un archivo `.ps1` versionado por hash, no pegando otra vez el bloque anterior.

La versión corregida:

- utiliza `Get-CheckedNativeScalar` para rama, remoto y SHA;
- conserva `Get-CheckedNativeOutput` para colecciones;
- no contiene ninguna aparición de `[0].Trim()`;
- valida su propio SHA antes de ejecutarse;
- exige que `HEAD` y `origin/main` coincidan con el SHA remoto documentado en ese momento.

## Intento 3 — 2026-07-26

### Qué funcionó

- el lanzador verificó el SHA-256 del script v3;
- se confirmó que el archivo no contenía el patrón defectuoso `[0].Trim()`;
- se confirmó la presencia de `Get-CheckedNativeScalar`;
- `git switch main`, `git fetch origin` y `git pull --ff-only origin main` finalizaron correctamente;
- se verificaron los hashes del ZIP candidato, ZIP de resultados, logo, lockfile y configuración Vitest;
- `npm ci` del candidato: aprobado, 201 paquetes instalados;
- instalación de Chromium: aprobada;
- ESLint: aprobado;
- TypeScript: aprobado;
- Vitest: 1 prueba aprobada;
- build de Vite: aprobado;
- verificación criptográfica del logo: aprobada;
- Playwright: 1 prueba aprobada, sin errores de consola;
- `git diff --cached --check` del candidato temporal: aprobado;
- `npm ls --depth=0`: aprobado;
- `git rm -r --ignore-unmatch -- .` retiró y preparó las eliminaciones de la implementación anterior;
- los 24 archivos de la candidata fueron copiados al checkout local.

### Qué falló

El primer comando fallido fue:

```powershell
git add -u -- .
```

Resultado:

```text
STAGE DE ELIMINACIONES falló con código 128.
```

`git rm -r -- .` ya había preparado todas las eliminaciones. Por lo tanto, la llamada posterior a `git add -u -- .` era redundante y no es necesaria para construir el índice final.

La salida recibida no contiene el mensaje fatal específico emitido por Git antes del código 128. No se atribuye el error a una variante concreta de `pathspec`, bloqueo del índice u otra causa interna sin evidencia adicional.

### Impacto verificado

- el checkout local quedó modificado;
- las eliminaciones de los archivos rastreados anteriores quedaron preparadas en el índice;
- los archivos de la candidata quedaron copiados en el árbol de trabajo;
- no se llegó al bucle que prepara individualmente los 24 archivos nuevos;
- no se ejecutó la validación del índice final;
- no se creó el commit de sustitución;
- no se hizo push;
- `origin/main` no recibió la base React.

Este intento sí dejó un estado local parcial y requiere recuperación controlada antes de volver a sincronizar.

### Corrección seleccionada

El intento siguiente debe:

1. verificar que `HEAD` continúa en el SHA desde el que comenzó el intento 3;
2. comprobar que no existe ningún commit local nuevo;
3. restaurar únicamente archivos rastreados desde `HEAD` mediante `git restore --source=HEAD --staged --worktree -- .`;
4. identificar archivos no rastreados residuales que coincidan exactamente con la candidata y retirarlos únicamente después de verificar sus hashes;
5. preservar ZIP, resultados, scripts y cualquier otro archivo no rastreado ajeno;
6. ejecutar `git fetch origin` y `git pull --ff-only origin main`;
7. repetir la validación completa;
8. ejecutar `git rm -r --ignore-unmatch -- .`;
9. copiar la candidata;
10. preparar únicamente cada uno de los 24 archivos esperados con `git add -- <ruta>`;
11. no volver a ejecutar `git add -u -- .`;
12. verificar que `git ls-files` contiene exactamente el conjunto esperado antes de crear el commit.

## Intento 4 — 2026-07-26

### Qué funcionó

- el lanzador verificó el SHA-256 del script v4;
- se confirmó la ausencia de `[0].Trim()`;
- se confirmó la presencia de `Get-CheckedNativeScalar`;
- se confirmó la recuperación controlada del intento 3;
- se restauraron desde `HEAD` los archivos rastreados y el índice;
- se retiraron únicamente residuos no rastreados que coincidían por SHA-256 con la candidata;
- `git fetch origin` y `git pull --ff-only origin main` finalizaron correctamente;
- el checkout local avanzó por fast-forward hasta `fd25d752a28b3e84ae1f8349a8064e2f910b97e0`;
- se verificaron nuevamente los hashes del ZIP candidato, ZIP de resultados, logo, lockfile y configuración Vitest;
- `npm ci` del candidato: aprobado;
- instalación de Chromium del candidato: aprobada;
- ESLint del candidato: aprobado;
- TypeScript del candidato: aprobado;
- Vitest del candidato: 1 prueba aprobada;
- build de Vite del candidato: aprobado;
- verificación criptográfica del logo: aprobada;
- Playwright del candidato: 1 prueba aprobada, sin errores de consola;
- `git diff --cached --check` del candidato temporal: aprobado;
- `npm ls --depth=0` del candidato: aprobado;
- se retiró nuevamente el árbol rastreado anterior;
- se copiaron y prepararon individualmente los 24 archivos de la candidata;
- `git ls-files` quedó limitado al conjunto esperado;
- `git diff --cached --check` de la sustitución: aprobado;
- `npm ci` del árbol final: aprobado;
- instalación de Chromium del árbol final: aprobada.

### Incidencia operativa no bloqueante

La orden de resumen del diff abrió el paginador interactivo `less`. Esto no invalidó el índice ni las validaciones, pero interrumpió innecesariamente el flujo de consola.

La siguiente versión utilizará `git --no-pager diff --cached --stat` y establecerá `GIT_PAGER=cat`.

### Qué falló

El primer control fallido fue `npm run lint`, ejecutado dentro de `npm run verify` sobre el árbol final.

ESLint recorrió este archivo local no rastreado:

```text
_block2-validation-result-v4/vitest.config.ts
```

El archivo no pertenece a los 24 archivos de la candidata ni está incluido en el `tsconfig.json` publicado. Como la configuración de TypeScript ESLint utiliza `projectService: true`, el análisis terminó con:

```text
Parsing error: ... vitest.config.ts was not found by the project service.
```

La candidata no falló: la misma candidata exacta había superado la validación completa en el directorio temporal limpio inmediatamente antes.

### Impacto verificado

- el checkout local volvió a quedar en un estado parcial;
- el índice contiene la sustitución preparada con los 24 archivos esperados;
- el árbol anterior está preparado para eliminación;
- no se creó el commit de sustitución;
- no se hizo push de la base React;
- `origin/main` continúa sin la implementación nueva;
- los ZIP, resultados, scripts y directorios de validación no rastreados permanecen preservados.

### Corrección seleccionada

El intento siguiente debe:

1. verificar que `HEAD` continúa en `fd25d752a28b3e84ae1f8349a8064e2f910b97e0`;
2. comprobar que el índice contiene exactamente el árbol candidato esperado y que no existen modificaciones rastreadas sin preparar;
3. restaurar de forma controlada `HEAD` antes de sincronizar la nueva documentación remota;
4. volver a aplicar y validar la candidata;
5. detectar archivos no rastreados con extensiones procesadas por ESLint (`.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`);
6. mover temporalmente fuera del repositorio únicamente sus entradas superiores, preservando ruta e integridad;
7. ejecutar todas las validaciones del árbol final mientras esos artefactos operativos están suspendidos;
8. mantenerlos suspendidos también durante la validación documental;
9. restaurarlos en un bloque `finally`, incluso ante error;
10. desactivar el paginador de Git;
11. crear y subir los commits únicamente después de todas las validaciones.

No se modifica la configuración ESLint de la candidata porque el archivo que causó el fallo es un artefacto operativo externo al árbol rastreado.

## Incidencia de documentación remota

Durante la documentación del intento 2, varias operaciones auxiliares del conector crearon archivos temporales en `docs/validation/`. La incidencia fue detectada antes de entregar la corrección.

Impacto:

- no afectó código de producción, dependencias, logo ni candidata v4;
- no ejecutó workflows;
- no sustituyó el árbol funcional;
- no creó commits de la base React;
- no realizó force-push ni reescritura de historial.

Los archivos temporales fueron eliminados inmediatamente mediante commits normales. El árbol actual conserva únicamente `docs/validation/BLOCK_2_PUBLICATION_ATTEMPTS.md` como registro canónico del intento. Los commits auxiliares permanecen en el historial por la regla de no reescritura y se consideran evidencia de la incidencia documental.

## Regla de actualización

Después de cada salida recibida se debe registrar:

1. estado inicial observado;
2. controles aprobados;
3. primer error real;
4. impacto sobre el árbol, índice, commits y remoto;
5. corrección aplicada;
6. SHA del commit documental;
7. siguiente paso seguro.

## Regla de seguridad

Un fallo ocurrido antes de la sustitución no debe repararse manualmente sobre el checkout. Se corrige el script y se repite el procedimiento completo desde el SHA remoto documentado.

## Intento 5 — Publicación definitiva

Resultado: verificado y publicado.

- SHA remoto previo: `7e39c5535800fdda31a48846f977fe5c1c05eb3f`;
- commit de sustitución: `45af35eedfcc9fc4629b70fc5380cf0e70695d26`;
- `npm ci`: aprobado;
- `npm run verify`: aprobado;
- `git diff --cached --check`: aprobado;
- `npm ls --depth=0`: aprobado;
- push de base: fast-forward;
- force-push: no utilizado.

La corrección aplicada recuperó de forma controlada el intento 4 interrumpido, suspendió temporalmente los artefactos no rastreados procesables por ESLint, desactivó el paginador de Git y repitió la publicación desde un árbol rastreado limpio.
