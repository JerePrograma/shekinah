# Migración desde el WordPress recuperado

Fecha de actualización: **2026-07-22**.

## Fuente de verdad

```text
Repositorio:             C:\laburo\shekinah
Restauración WordPress:  C:\laburo\shekinah-wordpress-reference
Compose:                 C:\laburo\shekinah-wordpress-reference\compose.yaml
Proyecto Compose:        shekinah-original-reference
Respaldo inmutable:      C:\Users\Jerem\Downloads\shekinah.orig
Auditoría SHA-256:       C:\Users\Jerem\Downloads\shekinah-original-audit
```

La URL se construye con `LOCAL_PORT` leído desde `.env`. La captura publicada el 22 de julio de 2026 leyó `8081` y usó `http://localhost:8081`; el script no presupone ese valor.

La implementación Astro anterior no es fuente de verdad. Solo puede utilizarse para checks de código transitorio; el build publicable requiere `reference-snapshot/site/index.html`.

## Ejecución maestra

```powershell
Set-Location 'C:\laburo\shekinah'
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass `
    -File .\scripts\Run-FullMigration.ps1 `
    -RepositoryRoot 'C:\laburo\shekinah' `
    -WorkRoot 'C:\laburo\shekinah-wordpress-reference' `
    -OriginalBackupRoot 'C:\Users\Jerem\Downloads\shekinah.orig' `
    -OriginalAuditRoot 'C:\Users\Jerem\Downloads\shekinah-original-audit' `
    -ProjectName 'shekinah-original-reference' `
    -Publish `
    -WaitForRemote
```

Sin `-Publish`, genera y verifica el snapshot pero no confirma ni envía cambios. Sin `-WaitForRemote`, publica Git y termina sin esperar CI o Cloudflare.

## Flujo realizado

1. valida rutas y fingerprints del respaldo y su auditoría;
2. exige `main` y protege cambios locales ajenos;
3. actualiza `main` y crea `pre-wordpress-reference-YYYYMMDD-HHMMSS`;
4. lee `LOCAL_PORT`;
5. levanta `db` y `wordpress` usando siempre `-p` y `-f` explícitos;
6. espera MariaDB y prueba WP-CLI;
7. repara usuario/permisos solo ante una falla comprobada;
8. importa SQL únicamente cuando no existen tablas WordPress;
9. verifica y corrige `home` y `siteurl`;
10. valida `/inicio/`;
11. exige Node 24 y npm 11;
12. ejecuta `npm ci` e instala Chromium;
13. exporta datos públicos sanitizados;
14. descubre rutas desde semillas, navegación y sitemaps;
15. renderiza con Chromium, activa lazy-loading y espera fuentes;
16. descarga recursos internos y externos usados, incluidos CSS, fuentes, fondos y `srcset`;
17. neutraliza endpoints y formularios no migrados;
18. genera HTML, redirecciones, robots, sitemap, 404, capturas y manifiesto SHA-256;
19. ejecuta verificaciones, E2E y fidelidad visual a cero píxeles;
20. confirma y publica únicamente si todo queda aprobado.

La captura se genera primero bajo `.migration-work/` y solo reemplaza `reference-snapshot/` después de aprobar hashes y estructura. Si una validación posterior falla antes del commit, el snapshot anterior se restaura y la candidata fallida permanece fuera de Git para diagnóstico. El log completo queda en `.migration-work/full-migration-YYYYMMDD-HHMMSS.log`.

## Datos públicos exportados

```text
reference-snapshot/data/plugins.json
reference-snapshot/data/themes.json
reference-snapshot/data/published-content.json
reference-snapshot/data/categories.json
reference-snapshot/data/forms.json
reference-snapshot/data/tags.json
reference-snapshot/data/navigation.json
reference-snapshot/data/public-settings.json
```

No se exportan usuarios, opciones privadas, SQL, credenciales, sesiones, IP internas ni logs.

## Captura de recursos

La captura conserva rutas `/wp-content/...` cuando contienen archivos públicos estáticos. Las URLs con query string reciben nombres deterministas con hash para evitar colisiones. Los recursos externos se guardan bajo `site/__external/` y quedan inventariados en el manifiesto.

Se bloquean o neutralizan:

- `wp-admin`;
- `wp-login.php`;
- XML-RPC y cron;
- comentarios dinámicos;
- `admin-ajax.php`;
- nonces y tokens ocultos;
- formularios que dependían de PHP;
- conexiones a localhost y al dominio Hostinger anterior.

## Salida esperada

```text
reference-snapshot/
  data/
  screenshots/
  site/
  manifest.json
  README.md
```

El manifiesto incluye páginas, redirecciones, recursos, formularios, recursos externos, errores HTTP, errores de consola, páginas no recuperables, tamaños y SHA-256.

## Resultado que debe copiarse para diagnóstico

Ante éxito, copiar desde:

```text
=== MIGRATION SUMMARY ===
```

hasta el final. Ante falla, copiar el primer error real y como máximo las últimas 100 líneas, además de:

```powershell
git status --short --branch
docker compose -p 'shekinah-original-reference' -f 'C:\laburo\shekinah-wordpress-reference\compose.yaml' ps
```
