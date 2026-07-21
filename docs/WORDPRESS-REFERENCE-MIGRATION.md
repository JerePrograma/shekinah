# Migración desde el WordPress recuperado

## Fuente de verdad

La fuente visual y de contenido es la restauración local disponible en:

```text
C:\laburo\shekinah-wordpress-reference
http://localhost:8081
```

El repositorio no versiona la base completa ni credenciales. El contenido público se obtiene del WordPress en ejecución y los medios se copian desde `wp-content/uploads` conservando rutas y nombres.

## Ejecución completa

Desde PowerShell 7:

```powershell
Set-Location 'C:\laburo\shekinah'
git switch main
git pull --ff-only origin main
Set-ExecutionPolicy -Scope Process Bypass

.\scripts\Migrate-WordPressReference.ps1 `
    -SourceUrl 'http://localhost:8081' `
    -WorkRoot 'C:\laburo\shekinah-wordpress-reference' `
    -RepositoryRoot 'C:\laburo\shekinah' `
    -Publish
```

El script:

1. exige una rama `main` limpia;
2. actualiza desde `origin/main`;
3. etiqueta el estado previo;
4. comprueba la restauración Docker;
5. exporta inventarios públicos mediante WP-CLI;
6. descubre rutas mediante sitemaps y navegación;
7. renderiza cada página con Chromium;
8. copia todos los medios públicos recuperados;
9. descarga recursos externos utilizados;
10. reescribe `localhost` y el dominio Hostinger;
11. genera capturas y hashes SHA-256;
12. construye y prueba el resultado;
13. compara visualmente el snapshot con WordPress en móvil, tablet y escritorio;
14. confirma y publica el snapshot cuando se usa `-Publish`.

## Resultado versionado

```text
reference-snapshot/
  data/          inventarios públicos
  screenshots/   capturas de referencia
  site/          raíz estática desplegable
  manifest.json  rutas, recursos, tamaños y hashes
```

Cuando `reference-snapshot/site/index.html` existe, `npm run build` copia ese snapshot a `dist`. Cloudflare Pages sigue desplegando `dist`.

## Límites deliberados

El repositorio público no reemplaza el panel administrativo WordPress. No se publican:

- login y administración;
- usuarios, contraseñas o correos administrativos;
- base completa;
- cron interno;
- caché de servidor;
- endpoints PHP de escritura.

Los formularios encontrados quedan registrados en `manifest.json` dentro de `dynamicFeatures`. Cada formulario debe clasificarse antes de declarar que su flujo funcional fue migrado. El sitio recuperado no incluye WooCommerce ni un plugin de formularios transaccionales; los plugins activos pertenecen a Hostinger y LiteSpeed.

## Verificación

```powershell
npm run verify:snapshot
npm run build
npm run audit:output
npm run test:e2e
$env:WORDPRESS_REFERENCE_URL = 'http://localhost:8081'
npm run test:fidelity
```

El manifiesto permite detectar cualquier archivo agregado, eliminado o modificado después de la captura. La comparación de fidelidad usa el mismo Chromium para la fuente y el snapshot y exige cero píxeles diferentes.
