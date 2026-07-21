# Estado de migración

Fecha de actualización: **2026-07-21**.

## Veredicto actual

**Infraestructura preparada; snapshot real pendiente.**

No existe en `main` un `reference-snapshot/manifest.json` generado desde el WordPress restaurado. Por lo tanto:

- la representación pública real todavía no está versionada;
- `npm run verify:snapshot:required` debe fallar;
- `npm run build` debe fallar;
- CI debe quedar bloqueado;
- el workflow de Cloudflare no debe desplegar;
- no corresponde declarar completada la migración.

## Completado en el repositorio

- orquestador PowerShell idempotente;
- lectura de `LOCAL_PORT`;
- Compose con proyecto y archivo explícitos;
- recuperación condicional de base y permisos;
- validación Node 24/npm 11;
- captura Chromium de rutas y recursos;
- inventarios públicos sanitizados;
- manifiesto SHA-256 requerido;
- build exclusivo desde snapshot;
- auditorías de límites, archivos prohibidos y secretos;
- E2E estáticos y comparación visual local;
- CI que exige snapshot;
- despliegue Pages condicionado a CI verde y credenciales.

## Pendientes bloqueantes

1. ejecutar `scripts/Run-FullMigration.ps1` contra la restauración local;
2. resolver cualquier error HTTP, consola, recurso o diferencia visual;
3. publicar snapshot y tag de rollback;
4. obtener CI verde para ese SHA;
5. configurar secretos Cloudflare;
6. desactivar cualquier integración Git nativa duplicada;
7. obtener deployment Pages verde para el mismo SHA;
8. verificar `https://shekinah-7dl.pages.dev` y rutas críticas.

## Criterio de cierre

Solo se cerrará cuando `main`, CI, deployment y producción apunten al mismo commit y la documentación incluya los conteos reales del manifiesto.
