# Verificación de CI

Fecha de actualización: **2026-07-21**.

## Estado previo a publicación

- Commit base: `8deba8911da82b48b6c91a5c23cd49000b0c457a`.
- Tag de rollback: `pre-wordpress-reference-20260721-173405`.
- Snapshot real: generado y aprobado localmente.
- Commit del snapshot: pendiente.
- CI del snapshot: pendiente.
- Deployment del mismo SHA: pendiente.

El CI anterior del commit base no valida este snapshot. Este documento se actualizará únicamente con las URLs y conclusiones reales de los workflows posteriores a la publicación.

GitHub todavía no contiene `CLOUDFLARE_API_TOKEN` ni `CLOUDFLARE_ACCOUNT_ID`; por lo tanto, se espera que el workflow de deployment se bloquee explícitamente hasta configurar ambos secretos.
