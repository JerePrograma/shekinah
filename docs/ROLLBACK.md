# Rollback

Fecha de actualización: **2026-07-22**.

La reversión debe preservar el historial. No usar `git reset --hard`, force-push ni reescritura de referencias.

## Reversión de la migración

Crear un commit inverso sobre `main`:

```bash
git switch main
git fetch origin
git pull --ff-only origin main
git revert <SHA_DE_LA_MIGRACION_REACT>
git push origin main
```

El CI validará el commit de reversión y, si pasa, Cloudflare Pages desplegará el estado anterior. El snapshot eliminado sigue disponible en el historial Git, por lo que no es necesario restaurarlo desde respaldos locales ni reescribir la rama.

## Reversión de un contenido puntual

Recuperar el archivo desde un commit conocido, revisarlo y crear un commit normal:

```bash
git show <SHA>:src/content.ts > src/content.ts
git diff -- src/content.ts
git add src/content.ts
git commit -m "revert: restore previous Shekinah content"
git push origin main
```
