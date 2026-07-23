# Rollback

Fecha de actualización: **2026-07-23**.

La reversión debe preservar el historial. No usar `git reset --hard`, force-push ni reescritura de referencias.

## Reversión de una publicación

Crear un commit inverso sobre `main`:

```bash
git switch main
git fetch origin
git pull --ff-only origin main
git revert <SHA_DEL_CAMBIO>
git push origin main
```

GitHub Actions validará el commit de reversión. Cloudflare Pages detectará el nuevo estado de `main`, generará el deployment y el workflow verificará después el dominio productivo.

## Reversión de un archivo puntual

Recuperar el archivo desde un commit conocido, revisarlo y crear un commit normal:

```bash
git show <SHA>:ruta/del/archivo > ruta/del/archivo
git diff -- ruta/del/archivo
git add ruta/del/archivo
git commit -m "revert: restore previous file state"
git push origin main
```

## Cloudflare Pages

No modificar manualmente los archivos de un deployment. La publicación debe provenir de un commit de `main` mediante la integración de Cloudflare Pages con GitHub.

Si un deployment nuevo falla pero el anterior sigue activo, conservar el deployment estable, corregir el repositorio y publicar otro commit normal. No es necesario eliminar el historial de deployments para restaurar producción.
