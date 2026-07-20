# Shekinah

[![CI](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml/badge.svg)](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml)

Sitio estático de Shekinah, reconstruido desde una instalación recuperada y publicado como proyecto Astro independiente. El resultado no ejecuta ni necesita WordPress, PHP, base de datos, Docker, Hostinger, LiteSpeed ni un backend persistente.

## Arquitectura

- **Astro 7** con generación estática.
- **TypeScript estricto** y Astro Content Collections.
- Contenido versionado en Markdown y datos TypeScript.
- CSS propio, mobile first, sin React ni Tailwind.
- JavaScript limitado al menú móvil.
- Pruebas unitarias con `node:test` y recorridos funcionales con Playwright.
- CI en GitHub Actions con Node.js 24 LTS.
- Despliegue preparado para Cloudflare Pages mediante Wrangler.

## Contenido recuperado

El sitio incluye una portada reconstruida, Nosotros, Tienda como catálogo informativo, Blog, Recetas, dos publicaciones, dos recetas y una página legal. Las rutas técnicas, duplicadas, borradores y contenido de demostración no se publicaron como contenido autónomo.

La procedencia, nivel de confianza y decisiones de migración están documentados en [`docs/MIGRATION-REPORT.md`](docs/MIGRATION-REPORT.md).

## Requisitos

- Node.js 24 LTS.
- npm 11 o compatible con el lockfile.

## Instalación y desarrollo opcional

```bash
npm ci
npm run dev
```

El desarrollo local es opcional. La edición y publicación pueden hacerse por completo desde GitHub.

## Validación

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

La verificación completa se agrupa en:

```bash
npm run verify
```

## Despliegue

El workflow `.github/workflows/deploy-cloudflare.yml` despliega `dist` al proyecto Cloudflare Pages `shekinah` después de un CI exitoso en `main`. Requiere únicamente estos secretos de repositorio:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

No existe una URL pública verificada mientras esos secretos y el proyecto Pages no estén configurados. `https://shekinah.pages.dev` es el canonical previsto, no una afirmación de despliegue vigente.

## Edición desde GitHub

- Páginas: `src/content/pages/`
- Publicaciones: `src/content/posts/`
- Recetas: `src/content/recipes/`
- Datos generales: `src/data/`
- Imágenes: `public/images/`
- Estilos: `src/styles/global.css`

La guía operativa completa está en [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md).

## Estructura principal

```text
.github/workflows/      CI y despliegue
public/images/          medios finales optimizados
scripts/migration/      extracción reproducible de evidencia
src/components/         componentes Astro reutilizables
src/content/            contenido editable y tipado
src/data/               configuración, navegación y redirecciones
src/pages/              rutas estáticas
tests/                  pruebas unitarias y Playwright
docs/                   inventarios e informes técnicos
```

## Rutas

| Ruta                       | Función                                       |
| -------------------------- | --------------------------------------------- |
| `/`                        | Portada reconstruida desde la página Inicio   |
| `/nosotros/`               | Identidad y propósito                         |
| `/tienda/`                 | Catálogo informativo sin comercio electrónico |
| `/blog/`                   | Índice de publicaciones                       |
| `/recetas/`                | Índice del recetario                          |
| `/chocolate-casero/`       | Receta recuperada                             |
| `/receta-barra-de-cereal/` | Receta parcial recuperada                     |
| `/terms-and-conditions/`   | Información legal publicada                   |
| `/404.html`                | Página no encontrada                          |

Las rutas y redirecciones históricas están detalladas en [`docs/ROUTE-MAP.md`](docs/ROUTE-MAP.md).

## Limitaciones

- No se reconstruyó una tienda transaccional porque no existe evidencia de productos, precios, stock o WooCommerce.
- Las imágenes remotas del diseño original no pudieron incorporarse de forma verificable; se sustituyeron por medios locales recuperados con intención visual equivalente.
- La receta de barras de cereal no contenía cantidades ni procedimiento completo; se conserva como contenido parcial y no se inventaron datos.
- La réplica visual no es pixel perfect: los adjuntos no contienen una captura completa y confiable de todas las vistas.
