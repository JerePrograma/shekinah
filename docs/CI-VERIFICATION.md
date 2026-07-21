# Verificación de CI

Fecha de actualización: **2026-07-21**.

## Estado actual

No existe un run de GitHub Actions que valide el snapshot WordPress real, porque `reference-snapshot/manifest.json` aún no está versionado.

Cualquier ejecución verde anterior corresponde a la implementación Astro transitoria y no satisface el criterio de aceptación actual.

## Evidencia requerida

Para cerrar esta verificación deben registrarse:

- SHA de `main` que contiene el snapshot;
- tag `pre-wordpress-reference-*`;
- fecha y URL del run CI;
- `npm ci` aprobado con Node 24/npm 11;
- verificación requerida del manifiesto;
- build desde `reference-snapshot/site`;
- unit tests y E2E aprobados;
- auditorías aprobadas;
- URL y resultado del workflow Cloudflare;
- verificación del dominio estable;
- coincidencia del SHA entre CI y deployment.

El script maestro genera una versión local preliminar de este documento. La evidencia remota debe agregarse únicamente después de que los workflows terminen.
