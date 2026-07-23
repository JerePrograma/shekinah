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

El workflow validará el commit de reversión y, si todas las verificaciones pasan, GitHub Pages desplegará el nuevo estado.

## Reversión de un archivo puntual

Recuperar el archivo desde un commit conocido, revisarlo y crear un commit normal:

```bash
git show <SHA>:ruta/del/archivo > ruta/del/archivo
git diff -- ruta/del/archivo
git add ruta/del/archivo
git commit -m "revert: restore previous file state"
git push origin main
```

No se debe modificar manualmente el contenido publicado en GitHub Pages. La publicación siempre debe provenir de un commit validado de `main`.
