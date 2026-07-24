# Operación y mantenimiento de Shekinah

Fecha de actualización: **2026-07-23**.

Shekinah es una aplicación estática React/TypeScript construida con Vite, prerenderizada como HTML y publicada en Cloudflare Pages. El repositorio y sus datos versionados son la fuente de verdad operativa.

## Flujo habitual

1. Revisar el estado real de `main` y sincronizarlo con `origin/main`.
2. Modificar únicamente los archivos necesarios.
3. Ejecutar las validaciones disponibles.
4. Revisar el diff completo.
5. Confirmar directamente en `main`.
6. Verificar que **CI** termine correctamente para ese SHA.
7. Verificar que **Deploy Cloudflare Pages** publique el mismo SHA.
8. Revisar `https://shekinah-7dl.pages.dev`.

Un push a `main` activa la validación. El despliegue de producción solo se ejecuta después de un CI exitoso.

## Arquitectura vigente

- Entrada cliente: `src/entry-client.tsx`.
- Entrada SSR: `src/entry-server.tsx`.
- Enrutamiento y composición: `src/siteApp.tsx`.
- Páginas institucionales: `src/App.tsx`.
- Catálogo y producto: `src/storePages.tsx`.
- Layout comercial: `src/storeShell.tsx`.
- Carrito local: `src/cart.tsx`.
- Contenido y navegación: `src/content.ts`.
- Datos comerciales: `src/generated/`.
- Proyección pública: `src/generated-public/`.
- Sistema visual global: `src/styles.css`.
- Estilos comerciales: `src/catalog.css` y `src/catalog-pagination.css`.
- SEO: `src/seo.ts` y `src/siteSeo.ts`.
- Prerender y redirecciones: `scripts/prerender.mjs`.

No existen colecciones Astro, un CMS, una base de datos ni un panel administrativo en producción.

## Cambiar un texto institucional

1. Localizar la página o el bloque en `src/App.tsx`, `src/content.ts` o `src/generated/wordpress-original-content.json`.
2. Confirmar que el texto no provenga de datos comerciales que deban conservarse literalmente.
3. Modificar solo la fuente correspondiente.
4. Ejecutar:

```bash
npm run prepare:data
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:unit
```

5. Revisar la ruta prerenderizada y sus metadatos.

## Cambiar una publicación informativa

Las entradas activas se encuentran en `src/generated/wordpress-original-content.json` y se proyectan a `src/generated-public/editorial.json` mediante `scripts/prepare-public-data.mjs`.

Al modificar una entrada:

1. conservar `path`, `kind`, `title`, `description`, `eyebrow`, imagen y bloques con tipos válidos;
2. no introducir beneficios medicinales no respaldados;
3. no agregar contenido ficticio;
4. ejecutar `npm run prepare:data`;
5. ejecutar `npm run build` y `npm run test:unit`;
6. revisar el artículo, el índice de guías, canonical, Open Graph y JSON-LD.

## Cambiar productos o categorías

Los productos y categorías no se editan desde los componentes visuales.

Fuentes:

- `src/generated/products.json`;
- `src/generated/categories.json`.

Reglas:

- conservar nombres, precios, moneda, unidad, SKU, slug, imágenes y relaciones salvo que exista una corrección comprobada;
- no inventar valores faltantes;
- no ocultar problemas de datos con CSS;
- ejecutar `npm run validate:content` antes y después del build;
- comprobar búsqueda, filtro, detalle, carrito y mensaje de WhatsApp.

## Cambiar datos generales

- Identidad, correo, domicilio y navegación: `src/content.ts`.
- WhatsApp y configuración comercial: `src/generated/site.json` y `src/catalog.ts`.
- Redirecciones: `src/content.ts` y generación en `scripts/prerender.mjs`.
- Estilos: `src/styles.css`, `src/catalog.css` y `src/catalog-pagination.css`.
- SEO institucional: `src/seo.ts`.
- SEO comercial: `src/siteSeo.ts`.

No agregar teléfonos, correos, domicilios, testimonios, precios, horarios o redes sociales sin una fuente confirmada.

## Cambiar o agregar una imagen

1. Optimizar la imagen en JPEG, PNG, WebP o AVIF.
2. Eliminar metadatos privados cuando existan.
3. Usar un nombre descriptivo en minúsculas y con guiones.
4. Guardarla dentro de `public/images/`.
5. Evitar archivos mayores a 25 MiB.
6. Definir ancho, alto y texto alternativo adecuados.
7. Actualizar la referencia en la fuente correspondiente.
8. Ejecutar build, pruebas y auditoría de salida.

No usar dominios remotos no controlados ni rutas heredadas de CMS.

## Cambiar una ruta

1. Localizar la declaración real en `src/content.ts`, `src/siteApp.tsx` o los datos comerciales.
2. Actualizar navegación solo si la ruta debe ser visible.
3. Agregar una redirección permanente desde la dirección anterior cuando corresponda.
4. Actualizar `docs/ROUTE-MAP.md` y `docs/CONTENT-INVENTORY.md`.
5. Revisar canonical, sitemap, enlaces internos y datos estructurados.
6. Agregar o ajustar pruebas de regresión.
7. Validar la redirección en Cloudflare Pages.

Eliminar una ruta sin redirección puede romper enlaces existentes y SEO.

## Revisar CI

1. Abrir **Actions → CI**.
2. Elegir el run asociado al último commit de `main`.
3. Confirmar que el SHA coincide.
4. Revisar, en orden:
   - instalación;
   - lint;
   - formato;
   - validación de catálogo;
   - build;
   - contenido generado;
   - pruebas unitarias;
   - Playwright;
   - auditorías de salida, copy, secretos y dependencias.
5. Ante un fallo, corregir la causa; no omitir ni silenciar la prueba.

## Revisar el despliegue

1. Abrir **Actions → Deploy Cloudflare Pages**.
2. Confirmar que el run usa el mismo SHA aprobado por CI.
3. Verificar que el proyecto de producción sea `shekinah` y la rama sea `main`.
4. Confirmar la promoción a producción.
5. Revisar portada, catálogo, un producto, contacto, carrito, sitemap y redirecciones.
6. Comprobar que no existan errores de consola ni enlaces rotos.

## Desarrollo local

Requisitos:

- Node.js 24 o superior;
- npm 11 o compatible.

```bash
git clone https://github.com/JerePrograma/shekinah.git
cd shekinah
npm install --package-lock=false --no-audit --no-fund
npm run dev
```

Validación completa:

```bash
npm run verify
```

Vista del build:

```bash
npm run build
npm run preview
```

## Flujo de uso publicado

1. Entrar a la portada.
2. Abrir **Productos**.
3. Buscar por nombre o elegir una categoría.
4. Abrir el detalle del producto.
5. Elegir cantidad y agregar al carrito.
6. Revisar, corregir o eliminar productos.
7. Enviar la consulta preparada por WhatsApp.
8. Usar **Contacto** para una consulta directa.

El sitio no procesa pagos ni pedidos automáticos. El carrito se conserva localmente en el navegador y prepara una consulta comercial.

## Criterio para considerar un cambio publicado

Un cambio está publicado solo cuando:

1. el commit existe en `main`;
2. CI está verde para ese SHA;
3. Cloudflare Pages publicó el mismo SHA;
4. la URL pública muestra el cambio;
5. las rutas críticas funcionan;
6. las auditorías no detectan secretos, enlaces rotos, contenido residual ni errores relevantes.
