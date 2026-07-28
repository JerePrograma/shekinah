# Validación del BLOQUE 6

## Estado

Candidata v1 preparada. Validación ejecutable pendiente.

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
