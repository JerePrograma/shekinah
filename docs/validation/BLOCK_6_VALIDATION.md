# Validación del BLOQUE 6

## Estado

Candidata v1 validada y publicada. El commit funcional es `d39fd3d03a4dd7fe34636e58ff7bf969d98c37be`; el registro documental se completa mediante el commit de recuperación que contiene esta actualización.

## Archivos candidatos

- `.github/workflows/ci.yml`;
- `.node-version`;
- `README.md`;
- `package.json`;
- `scripts/verify-automation.mjs`;
- `docs/PROVENANCE.md`;
- `docs/AUTHORIZED_ASSETS.md`;
- `docs/ARCHITECTURE.md`;
- `docs/ACCESSIBILITY.md`;
- `docs/DEPLOYMENT.md`;
- `docs/THIRD_PARTY_NOTICES.md`;
- `docs/design/BLOCK_6_AUTOMATION_DEPLOYMENT.md`;
- `docs/validation/BLOCK_6_VALIDATION.md`.

## Controles requeridos

1. lista exacta de trece archivos;
2. ausencia de cambios en `package-lock.json`;
3. ausencia de cambios bajo `src`, `public` y `tests`;
4. `.node-version` exacto;
5. sintaxis válida de YAML;
6. un único workflow;
7. permisos `contents: read`;
8. acciones oficiales fijadas a SHA completo;
9. checkout sin credenciales persistentes;
10. ausencia de secretos y permisos de escritura;
11. ausencia de comandos de despliegue;
12. instalación reproducible;
13. instalación de Chromium con dependencias;
14. ejecución literal de `npm run verify`;
15. artefacto limitado a `dist`;
16. scripts `build:pages` y `verify:automation`;
17. documentación obligatoria completa;
18. ausencia de afirmaciones de despliegue no verificadas;
19. `npm ci`;
20. `npm run verify`;
21. `npm run build:pages`;
22. `npm run verify:automation`;
23. `git diff --check`;
24. revisión manual del workflow.

## Criterio de publicación

No se debe publicar el candidato hasta obtener un resultado `SUCCESS` sobre la base remota exacta y comprobar que la validación no modifica el lockfile ni archivos de aplicación.
## Resultado ejecutado

Resultado técnico del candidato: `SUCCESS`.

- base remota validada: `5b9da6eba55bfbea437f29ca192f64982224303e`;
- ZIP candidato: `3ac28d6391b0aa7226c7fc38f829121ddb6d767daa9fab46f3c6d16bd446e3f8`;
- ZIP de validación: `8f8f78748e76005ce1e8196e63d4b3470945bba078fc123cc5e99a30d64baf90`;
- commit funcional publicado: `d39fd3d03a4dd7fe34636e58ff7bf969d98c37be`;
- publicación funcional: fast-forward sobre `main`;
- `npm ci`: aprobado;
- instalación de Chromium: aprobada;
- `npm run verify`: aprobado;
- Vitest: 4 archivos y 21 pruebas aprobadas;
- Playwright: 3 pruebas E2E aprobadas;
- `npm run build:pages`: aprobado;
- `npm run verify:automation`: aprobado;
- logo autorizado: verificado por ruta, dimensiones, tamaño y SHA-256;
- `package-lock.json`: sin cambios;
- archivos bajo `src`, `public` y `tests`: sin cambios.

## Incidente posterior al push funcional

La fase `REGISTRAR PUBLICACIÓN` falló después de que el commit funcional ya había sido enviado correctamente a `origin/main`.

Causa: el escritor PowerShell recibió líneas Markdown vacías en un parámetro obligatorio que no admitía cadenas vacías. El enlace del parámetro `Lines` se interrumpió al intentar escribir el registro de progreso.

Antes de ese fallo, el script original alcanzó a modificar localmente `BLOCK_6_PLAN.md` y `BLOCK_6_VALIDATION.md`, pero no creó el commit documental. Esos cambios parciales fueron respaldados antes de reconstruir el registro desde el commit funcional.

Evidencia local del intento fallido:

- archivo: `shekinah-block6-publication-result-v2.zip`;
- SHA-256: `a17d3af9f0651d046954336ec27f44d48d88c1b93265abdb75614b9c6e0f3e66`;
- commit funcional preservado: `d39fd3d03a4dd7fe34636e58ff7bf969d98c37be`;
- respaldo de modificaciones parciales: `shekinah-block6-partial-local-backup-20260728-150448.zip`;
- SHA-256 del respaldo parcial: `60b8155d4444ec103834bfb78410355bd6d05b069231d5d9159c7d673fa8076f`.

El incidente no invalida las verificaciones técnicas ni el push funcional. Sí dejó incompletos el registro de progreso, el estado de este documento y el commit documental final.

## Recuperación documental

La recuperación:

1. comprobó que `HEAD` y `origin/main` seguían apuntando exactamente al commit funcional;
2. admitió únicamente las dos modificaciones locales parciales conocidas y no staged;
3. preservó esas modificaciones y su diff en un ZIP de evidencia;
4. restauró los documentos desde el commit funcional;
5. generó un registro documental canónico;
6. volvió a ejecutar la validación completa;
7. validó el diff y el stage;
8. creó y publicó un commit documental normal, sin force-push.
