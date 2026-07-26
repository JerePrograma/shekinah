# Intentos de publicación del BLOQUE 2

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

La siguiente ejecución debe volver a comprobar hashes, estado local, SHA remoto y validaciones completas antes de modificar el árbol.

## Regla de seguridad

Un fallo ocurrido antes de la sustitución no debe repararse manualmente sobre el checkout. Se corrige el script y se repite el procedimiento completo desde el SHA remoto documentado.
