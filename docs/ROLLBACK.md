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

El workflow `CI` validará el commit de reversión. Si pasa, `Deploy Cloudflare Pages` publicará exactamente ese SHA y verificará el dominio productivo.

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

No modificar manualmente los archivos de un deployment ni alterar la rama productiva para resolver una incidencia. La publicación debe provenir de un SHA de `main` aprobado por `CI`.

Si una publicación nueva falla, Cloudflare conserva el deployment estable anterior. Corregir el repositorio y crear otro commit normal; el publicador validado reemplazará producción únicamente cuando finalice correctamente.
