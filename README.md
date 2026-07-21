# Shekinah

[![CI](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml/badge.svg)](https://github.com/JerePrograma/shekinah/actions/workflows/ci.yml)

Sitio estático de Shekinah reconstruido desde una instalación WordPress recuperada y migrado a Astro. El resultado final no ejecuta ni necesita WordPress, PHP, base de datos, Docker, Hostinger, LiteSpeed, backend persistente ni acceso futuro a los adjuntos originales.

## Estado actual

- Rama operativa y de producción: `main`.
- Código, contenido, medios, pruebas, automatizaciones y documentación: unificados en `main`.
- Pull requests e issues abiertos detectados: ninguno.
- Última validación integral registrada: aprobada con Node.js 24, npm 11, pruebas unitarias y 45 pruebas Playwright.
- Los cambios finales de consolidación deben quedar verdes en el próximo run de CI; no se presentan como verificados antes de que ese run exista.
- Proyecto Cloudflare Pages esperado: `shekinah`.
- Dominio estable asignado: `https://shekinah-7dl.pages.dev`.
- Publicación pública: pendiente de configurar credenciales, ejecutar el workflow y verificar el sitio.

Estado detallado: [`docs/MIGRATION-STATUS.md`](docs/MIGRATION-STATUS.md).

## Arquitectura

- Astro 7 con generación estática.
- TypeScript estricto y Astro Content Collections.
- Contenido versionado en Markdown y datos TypeScript.
- CSS propio, mobile first, sin React ni Tailwind.
- JavaScript limitado a interacciones reales, como el menú móvil.
- Pruebas unitarias con `node:test` y pruebas funcionales con Playwright.
- CI en GitHub Actions con Node.js 24.
- Despliegue de Pages con Wrangler después de un CI verde.

## Flujo de publicación elegido

```text
commit en main
  → GitHub Actions: CI
  → npm ci + check + lint + formato + build + pruebas + auditorías
  → CI verde
  → GitHub Actions: Deploy Cloudflare Pages
  → checkout del mismo SHA validado
  → npm run verify
  → wrangler pages deploy dist
  → verificación HTTP
  → shekinah-7dl.pages.dev
```

Este es el único publicador automático. Una integración Git o un Worker de Cloudflare conectado al mismo repositorio debe quedar deshabilitado o desconectado para evitar despliegues duplicados y la ejecución incorrecta de `npx wrangler deploy`.

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

Astro mostrará la URL local, normalmente `http://localhost:4321`. El entorno local es opcional y no forma parte del despliegue productivo.

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

## Configurar el primer despliegue

1. Confirmar en Cloudflare que existe un proyecto **Pages** llamado `shekinah`.
2. Si existe una integración Git automática, deshabilitar sus deployments automáticos.
3. Si el panel muestra un recurso **Worker** con `Deploy command = npx wrangler deploy`, desconectarlo del repositorio; ese flujo no corresponde al sitio estático Pages.
4. Crear un API Token limitado a la cuenta y con permiso de edición de Cloudflare Pages.
5. Copiar el **Account ID** de la cuenta correcta.
6. En GitHub, abrir **Settings → Secrets and variables → Actions**.
7. Crear estos secretos:

   ```text
   CLOUDFLARE_API_TOKEN
   CLOUDFLARE_ACCOUNT_ID
   ```

8. Abrir **Actions → CI → Run workflow** y ejecutar sobre `main`.
9. Cuando CI quede verde, el workflow **Deploy Cloudflare Pages** se iniciará automáticamente.
10. También puede ejecutarse manualmente desde **Actions → Deploy Cloudflare Pages → Run workflow**.
11. Verificar el environment `cloudflare-pages-production` y el dominio estable.

Procedimiento completo: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Flujo normal de edición y publicación

1. Editar contenido, estilos, componentes o datos.
2. Confirmar el cambio directamente en `main`.
3. Revisar **GitHub → Actions → CI**.
4. Corregir el primer control rojo; no omitir validaciones.
5. Con CI verde y secretos configurados, esperar **Deploy Cloudflare Pages**.
6. Verificar `https://shekinah-7dl.pages.dev` y la ruta modificada.
7. Confirmar que el deployment de Cloudflare corresponde al SHA validado.

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
.github/workflows/      CI y despliegue de producción
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

Mapa completo: [`docs/ROUTE-MAP.md`](docs/ROUTE-MAP.md).

## Documentación

- Inventario de adjuntos: `docs/ATTACHMENT-INVENTORY.md`.
- Inventario de contenido: `docs/CONTENT-INVENTORY.md`.
- Inventario de medios: `docs/MEDIA-INVENTORY.md`.
- Comparación de fuentes: `docs/DATA-SOURCE-COMPARISON.md`.
- Informe de migración: `docs/MIGRATION-REPORT.md`.
- Estado y pendientes: `docs/MIGRATION-STATUS.md`.
- Configuración diagnosticada de Cloudflare: `docs/CLOUDFLARE-CURRENT-SETUP.md`.
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
- No existen usuarios, panel administrativo, carrito, pedidos, pagos ni base de datos.
