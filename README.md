# Shekinah

[![CI](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml/badge.svg)](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml)

Sitio estático de Shekinah reconstruido desde una instalación WordPress recuperada y migrado a Astro. El resultado final no ejecuta ni necesita WordPress, PHP, base de datos, Docker, Hostinger, LiteSpeed, backend persistente ni acceso futuro a los adjuntos originales.

## Estado actual

- Rama operativa y de producción: `main`.
- Código, contenido, medios, pruebas, automatizaciones y documentación: unificados en `main`.
- Pull requests abiertos detectados: ninguno.
- Build Astro: verificado previamente en GitHub Actions.
- Pruebas Playwright: 45 recorridos aprobados en la última ejecución remota registrada.
- Proyecto Cloudflare Pages: `shekinah`.
- Dominio estable asignado: `https://shekinah-7dl.pages.dev`.
- Integración Git de Cloudflare: conectada a `JerePrograma/shekinah`, rama `main`.
- Pendiente externo: corregir en Cloudflare el comando de despliegue y ejecutar/verificar el primer deploy válido.

El último fallo observado no fue del proyecto: `npm run build` terminó correctamente, pero Cloudflare intentó ejecutar `npx wrangler deploy`, comando de Workers. Para Pages debe usarse:

```bash
npx wrangler pages deploy dist --project-name shekinah --branch main
```

Estado vivo y pendientes: [`docs/MIGRATION-STATUS.md`](docs/MIGRATION-STATUS.md).

## Arquitectura

- Astro 7 con generación estática.
- TypeScript estricto y Astro Content Collections.
- Contenido versionado en Markdown y datos TypeScript.
- CSS propio, mobile first, sin React ni Tailwind.
- JavaScript limitado a interacciones reales, como el menú móvil.
- Pruebas unitarias con `node:test` y pruebas funcionales con Playwright.
- CI en GitHub Actions con Node.js 24.
- Publicación principal mediante integración Git de Cloudflare Pages.
- Workflow manual de GitHub Actions disponible únicamente como respaldo.

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

## Levantar el proyecto localmente

Requisitos:

- Node.js 24 o superior;
- npm 11 o compatible con `package-lock.json`.

```bash
git clone https://github.com/JerePrograma/shekinah.git
cd shekinah
npm ci
npm run dev
```

Astro mostrará la URL local, normalmente `http://localhost:4321`. El entorno local es solo para desarrollo opcional; no forma parte del despliegue productivo.

## Validar antes de publicar

Verificación completa:

```bash
npm ci
npm run verify
```

Controles individuales:

```bash
npm run check
npm run lint
npm run format:check
npm run build
npm run test
npm run audit:output
npm run audit:secrets
```

Vista del build final:

```bash
npm run build
npm run preview
```

## Flujo normal de edición y publicación

1. Editar contenido, estilos, componentes o datos.
2. Confirmar el cambio directamente en `main`.
3. Revisar **GitHub → Actions → CI**.
4. No publicar ni ignorar controles mientras CI esté rojo.
5. Con CI verde, Cloudflare detecta el push a `main`, instala dependencias, construye `dist` y lo publica.
6. Verificar `https://shekinah-7dl.pages.dev` y la ruta modificada.
7. Confirmar que el deployment de Cloudflare corresponde al SHA de `main`.

La integración Git de Cloudflare es el mecanismo principal. No deben configurarse simultáneamente los secretos del workflow manual salvo que se decida usarlo como recuperación controlada.

## Configuración exacta de Cloudflare

En **Workers & Pages → shekinah → Settings → Build**:

| Campo | Valor |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler pages deploy dist --project-name shekinah --branch main` |
| Root directory | `/` |
| Variable `SITE_URL` | `https://shekinah-7dl.pages.dev` |

Después de guardar, ejecutar **Retry deployment** sobre el último despliegue fallido o provocar un nuevo deploy con un commit válido en `main`.

Procedimiento detallado: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

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
.github/workflows/      CI y despliegue manual de respaldo
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

Mapa completo: [`docs/ROUTE-MAP.md`](docs/ROUTE-MAP.md).

## Documentación

- Inventario de adjuntos: `docs/ATTACHMENT-INVENTORY.md`.
- Inventario de contenido: `docs/CONTENT-INVENTORY.md`.
- Inventario de medios: `docs/MEDIA-INVENTORY.md`.
- Comparación de fuentes: `docs/DATA-SOURCE-COMPARISON.md`.
- Informe de migración: `docs/MIGRATION-REPORT.md`.
- Estado y pendientes: `docs/MIGRATION-STATUS.md`.
- Configuración actual de Cloudflare: `docs/CLOUDFLARE-CURRENT-SETUP.md`.
- Reconstrucción visual: `docs/VISUAL-RECONSTRUCTION.md`.
- Seguridad: `docs/SECURITY-REPORT.md`.
- Pruebas: `docs/TEST-REPORT.md`.
- GitHub Actions: `docs/GITHUB-ACTIONS.md`.
- Despliegue: `docs/DEPLOYMENT.md`.
- Operación y edición: `docs/MAINTENANCE.md`.
- Rollback: `docs/ROLLBACK.md`.

## Limitaciones reales

- No se reconstruyó una tienda transaccional porque no existe evidencia suficiente de productos, precios, stock o WooCommerce.
- Las imágenes remotas del diseño original se sustituyeron por medios locales recuperados para eliminar dependencias externas.
- La receta de barras de cereal no contenía cantidades ni procedimiento completo; se conserva como contenido parcial sin inventar datos.
- La réplica visual no es pixel perfect porque los adjuntos no incluyen capturas completas y verificables de todas las vistas.
- El único bloqueo actual está fuera del código: corregir y verificar la configuración de despliegue en Cloudflare.
