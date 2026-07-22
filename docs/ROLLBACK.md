# Rollback

Fecha de actualización: **2026-07-22**.

## Punto previo a la captura

Antes de generar el snapshot, `scripts/Run-FullMigration.ps1` crea una etiqueta anotada:

```text
pre-wordpress-reference-YYYYMMDD-HHMMSS
```

La etiqueta apunta al `main` limpio y actualizado previo a la captura. Solo se publica después de que las verificaciones locales aprueben.

Para esta migración, el punto previo seleccionado es `pre-wordpress-reference-20260721-173405`, que apunta a `8deba8911da82b48b6c91a5c23cd49000b0c457a`.

La reejecución publicada creó además `pre-wordpress-reference-20260722-101709`, que apunta a `ebb2d25284aead867a5bc2c042cbbaecf6c89b46`. Este tag adicional no reemplaza ni mueve el tag histórico.

## Reglas

- no usar `force push`;
- no borrar historial;
- no publicar SQL, backups o credenciales;
- no mover `main` directamente hacia atrás;
- revertir mediante un commit nuevo;
- exigir CI verde antes de desplegar la reversión;
- mantener el mismo SHA en GitHub Actions y Cloudflare.

## Revertir el snapshot

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location 'C:\laburo\shekinah'
git switch main
if ($LASTEXITCODE -ne 0) { throw 'No se pudo cambiar a main.' }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar main.' }
git log --oneline --decorate -20
git revert <SHA_DEL_COMMIT_DEL_SNAPSHOT>
if ($LASTEXITCODE -ne 0) { throw 'Falló git revert.' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Falló el push de la reversión.' }
```

No desplegar directamente el contenido de la etiqueta sobre producción sin crear un commit de reversión trazable.

## Rollback temporal en Cloudflare

Cloudflare Pages puede conservar deployments anteriores. Puede seleccionarse temporalmente uno estable mientras se revierte `main`, pero el siguiente deployment automático volverá a seguir el repositorio. La corrección en Git sigue siendo obligatoria.

## Verificación posterior

- CI verde para el commit de reversión;
- deployment verde para el mismo SHA;
- dominio estable accesible;
- rutas, robots y sitemap correctos;
- ausencia de secretos, PHP y referencias heredadas.
