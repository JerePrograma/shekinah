# Recuperación Hostinger y referencia WordPress

## Jerarquía aplicada

1. HTML público del Hostinger original.
2. `astro-island` y datos serializados presentes en ese HTML.
3. Recursos públicos enlazados.
4. Respaldo WordPress como evidencia complementaria.
5. Evidencias versionadas e historial Git.
6. Aplicación React previa solo como contexto arquitectónico.

Cuando dos fuentes difieren, Hostinger público tiene prioridad sobre WordPress. Cada entidad importada conserva procedencia, archivo, SHA-256, isla y advertencias.

## Crawler público

`scripts/crawl-hostinger-original.mjs`:

- restringe todas las URLs al origen configurado;
- usa un agente identificable;
- limita concurrencia a un máximo de cuatro;
- aplica tres intentos y timeout;
- consulta `robots.txt`, `sitemap.xml` y `sitemap-index.xml`;
- descubre enlaces internos;
- deduplica URLs;
- guarda HTML en `.migration-work/` por hash;
- produce un manifiesto sin sesiones ni datos privados.

Ejemplo:

```bash
npm run crawl:original -- \
  --origin https://herbalarioonline.com \
  --output .migration-work/hostinger-public \
  --concurrency 2 \
  --max-pages 2000
```

No accede a paneles, endpoints autenticados ni checkout privado.

## Importador Hostinger/Astro

`scripts/import-hostinger-original.mjs` recibe varios `--source`; cada fuente puede ser un HTML o un directorio. El proceso:

1. ordena archivos;
2. valida UTF-8;
3. calcula SHA-256;
4. detecta truncamiento;
5. localiza cada `astro-island` sin ejecutar HTML;
6. decodifica entidades y `JSON.parse`;
7. decodifica tipos Astro 0–11;
8. preserva tipos desconocidos como datos;
9. normaliza páginas, productos, categorías y activos;
10. deduplica por identidad y hash cuando descarga;
11. genera reportes deterministas.

Salidas:

```text
generated/hostinger-original/
  sources.json
  decoded-astro.json
  site.json
  pages.json
  products.json
  categories.json
  routes.json
  assets.json
  collisions.json
  missing-data.json
  fidelity.json
```

El importador falla si no recupera productos; no genera un catálogo vacío presentado como migración completa.

## Descarga de activos

Con `--download-assets`:

- acepta únicamente MIME `image/*`;
- rechaza cuerpos vacíos y HTML disfrazado;
- calcula SHA-256;
- deduplica por hash;
- registra URL, usos, ruta local, MIME, tamaño, estado y error.

No se usan imágenes buscadas en Internet, generación de imágenes ni hotlinking como sustituto silencioso.

## Referencia WordPress

El RAR fue inventariado antes de cualquier ejecución. Datos sanitizados:

| Métrica | Valor |
|---|---:|
| Tamaño | 185111245 bytes |
| SHA-256 | `9ecc8d7d2846d34392880cac5f1f41be62794cacf84843c5ec0fb19988fa8ced` |
| Entradas | 14720 |
| Tablas SQL | 21 |
| `wp_posts` | 35 |
| Attachments | 20 |
| Productos WordPress detectados | 0 |

El `compose.yaml` original publica `${LOCAL_PORT}:80` sin un binding explícito a `127.0.0.1`. Por eso el wrapper bloquea `-RestoreWordPress`; el SQL y los uploads aportan evidencia suficiente para esta fase y no justifican ejecutar una restauración menos aislada.

## PowerShell

```powershell
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\Recover-ShekinahOriginal.ps1 `
  -RepoPath 'C:\laburo\shekinah' `
  -ReferencePath 'C:\laburo\shekinah-wordpress-reference' `
  -ArchivePath 'C:\ruta\shekinah-wordpress-reference.rar' `
  -DownloadAssets `
  -RunVerification
```

El script valida herramientas, versiones, RAR, remoto, rama, estado limpio y sincronización fast-forward. No hace commit ni push automático; obliga a revisar manifiestos y diff.

## Regeneración determinista

Ejecutar el importador dos veces sobre la misma captura debe dejar los JSON idénticos. Las pruebas unitarias verifican orden estable, múltiples archivos, tipos Astro, productos, categorías, activos y colisiones básicas.
