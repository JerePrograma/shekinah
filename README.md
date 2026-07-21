# Shekinah

[![CI](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml/badge.svg)](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml)

Sitio estático de Shekinah reconstruido desde una instalación recuperada y migrado a Astro. El proyecto final no ejecuta ni necesita WordPress, PHP, base de datos, Docker, Hostinger, LiteSpeed, backend persistente ni acceso futuro a los adjuntos originales.

## Estado

- Código, contenido, medios, scripts, pruebas y documentación: publicados en `main`.
- `package-lock.json`: publicado y reproducible.
- CI: configurado para cada push a `main` y ejecución manual.
- Cloudflare Pages: workflow preparado; despliegue pendiente de credenciales y verificación pública.
- URL prevista: `https://shekinah.pages.dev`; no se considera confirmada hasta completar el primer deploy.

El detalle vivo del progreso y las tareas pendientes está en [`docs/MIGRATION-STATUS.md`](docs/MIGRATION-STATUS.md).

## Arquitectura

- **Astro 7** con generación estática.
- **TypeScript estricto** y Astro Content Collections.
- Contenido versionado en Markdown y datos TypeScript.
- CSS propio, mobile first, sin React ni Tailwind.
- JavaScript limitado a interacciones reales como el menú móvil.
- Pruebas unitarias con `node:test` y recorridos funcionales con Playwright.
- CI en GitHub Actions con Node.js 24 LTS.
- Despliegue preparado para Cloudflare Pages mediante Wrangler.

## Contenido recuperado

El sitio incluye:

- portada reconstruida;
- Nosotros;
- Tienda como catálogo informativo;
- Blog y dos publicaciones;
- Recetas y dos recetas recuperadas;
- página legal canónica;
- 404 y redirecciones históricas.

Las rutas técnicas, duplicadas, borradores y contenido de demostración no se publicaron como contenido autónomo. La procedencia, confianza y decisiones están documentadas en [`docs/MIGRATION-REPORT.md`](docs/MIGRATION-REPORT.md).

## Requisitos para desarrollo local opcional

- Node.js 24 LTS.
- npm 11 o compatible con el lockfile.

```bash
npm ci
npm run dev
```

El desarrollo local es opcional. La edición y publicación habituales pueden hacerse completamente desde GitHub.

## Validación

Comandos individuales:

```bash
npm ci
npm run check
npm run lint
npm run format:check
npm run build
npm run test
npm run audit:output
npm run audit:secrets
```

Verificación completa:

```bash
npm run verify
```

Vista del build:

```bash
npm run build
npm run preview
```

## Flujo habitual de uso

### Editar y publicar sin instalación local

1. Editar un archivo de `src/content/`, `src/data/`, `src/components/` o `src/styles/` desde GitHub.
2. Confirmar el cambio directamente en `main`.
3. Revisar **Actions → CI**.
4. Corregir cualquier fallo; no omitir controles.
5. Cuando CI esté verde, el workflow de Cloudflare se ejecutará automáticamente si los secretos están configurados.
6. Verificar la URL pública y el SHA desplegado.

Guía completa: [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md).

### Desplegar por primera vez

1. Crear en Cloudflare Pages un proyecto Direct Upload llamado `shekinah`.
2. Crear un API Token con permisos mínimos para Pages.
3. Guardar en GitHub Actions los secretos:
   - `CLOUDFLARE_API_TOKEN`;
   - `CLOUDFLARE_ACCOUNT_ID`.
4. Ejecutar **Deploy Cloudflare Pages** manualmente o confirmar un nuevo commit válido en `main`.
5. Verificar la URL, las rutas y el SHA publicado.

Procedimiento exacto: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Edición de contenido

- Páginas: `src/content/pages/`.
- Publicaciones: `src/content/posts/`.
- Recetas: `src/content/recipes/`.
- Datos generales: `src/data/`.
- Imágenes: `public/images/`.
- Estilos: `src/styles/global.css`.
- Componentes: `src/components/`.

## Estructura principal

```text
.github/workflows/      CI y despliegue
docs/                   inventarios, informes y runbooks
public/images/          medios finales optimizados
scripts/migration/      extracción reproducible de evidencia
src/components/         componentes Astro reutilizables
src/content/            contenido editable y tipado
src/data/               configuración, navegación y redirecciones
src/pages/              rutas estáticas
src/styles/             sistema visual propio
tests/                  pruebas unitarias y Playwright
```

## Rutas principales

| Ruta | Función |
| --- | --- |
| `/` | Portada reconstruida desde la página Inicio |
| `/nosotros/` | Identidad y propósito |
| `/tienda/` | Catálogo informativo sin comercio electrónico |
| `/blog/` | Índice de publicaciones |
| `/recetas/` | Índice del recetario |
| `/chocolate-casero/` | Receta recuperada |
| `/receta-barra-de-cereal/` | Receta parcial recuperada |
| `/terms-and-conditions/` | Información legal publicada |
| `/404.html` | Página no encontrada |

El mapa completo y las redirecciones están en [`docs/ROUTE-MAP.md`](docs/ROUTE-MAP.md).

## Documentación

- Inventario de adjuntos: `docs/ATTACHMENT-INVENTORY.md`.
- Inventario de contenido: `docs/CONTENT-INVENTORY.md`.
- Inventario de medios: `docs/MEDIA-INVENTORY.md`.
- Comparación de fuentes: `docs/DATA-SOURCE-COMPARISON.md`.
- Informe de migración: `docs/MIGRATION-REPORT.md`.
- Estado y pendientes: `docs/MIGRATION-STATUS.md`.
- Reconstrucción visual: `docs/VISUAL-RECONSTRUCTION.md`.
- Seguridad: `docs/SECURITY-REPORT.md`.
- Pruebas: `docs/TEST-REPORT.md`.
- GitHub Actions: `docs/GITHUB-ACTIONS.md`.
- Despliegue: `docs/DEPLOYMENT.md`.
- Operación y edición: `docs/MAINTENANCE.md`.
- Rollback: `docs/ROLLBACK.md`.

## Limitaciones reales

- No se reconstruyó una tienda transaccional porque no existe evidencia de productos, precios, stock o WooCommerce.
- Las imágenes remotas del diseño original se sustituyeron por medios locales recuperados para evitar dependencias externas.
- La receta de barras de cereal no contenía cantidades ni procedimiento completo; se conserva como contenido parcial sin inventar datos.
- La réplica visual no es pixel perfect porque los adjuntos no incluyen capturas completas y verificables de todas las vistas.
- La publicación pública depende únicamente de completar las credenciales de Cloudflare y verificar el primer despliegue.
