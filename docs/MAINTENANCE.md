# Operación y mantenimiento de Shekinah

Fecha de actualización: **2026-07-21**.

El sitio puede editarse, validarse y publicarse íntegramente desde GitHub y Cloudflare. Una instalación local es opcional y no constituye una dependencia operativa.

## Flujo habitual

1. Editar o crear archivos desde GitHub o desde un checkout temporal.
2. Confirmar el cambio directamente en `main`.
3. Abrir **GitHub → Actions → CI**.
4. Confirmar que `Validate static site` termina en verde.
5. Abrir **Cloudflare → Workers & Pages → shekinah → Deployments**.
6. Confirmar que Cloudflare construyó y publicó el mismo SHA de `main`.
7. Abrir `https://shekinah-7dl.pages.dev` y revisar la ruta modificada.

Un push a `main` es la única acción habitual de publicación. El workflow de GitHub Actions para Cloudflare es manual y queda reservado para contingencias.

## Cambiar un texto existente

1. Abrir `src/content/`.
2. Elegir `pages`, `posts` o `recipes`.
3. Abrir el Markdown correspondiente.
4. Pulsar **Edit this file**.
5. Modificar el cuerpo.
6. Cambiar el frontmatter YAML solo cuando se necesite actualizar título, descripción, fecha, imagen, etiquetas o SEO.
7. Pulsar **Commit changes**.
8. Confirmar directamente en `main`.
9. Revisar CI y el deployment de Cloudflare.

## Agregar una publicación de blog

1. Abrir `src/content/posts/`.
2. Crear un archivo con nombre minúsculo y guiones, por ejemplo `como-conservar-especias.md`.
3. Copiar la estructura de una entrada existente.
4. Completar al menos:
   - `title`;
   - `description`;
   - `publishedAt`;
   - `updatedAt` cuando corresponda;
   - `author`;
   - `categories`;
   - `tags`;
   - `image` e `imageAlt`;
   - `source` o procedencia editorial documentada.
5. Escribir el contenido en Markdown semántico.
6. Usar una imagen ubicada dentro de `public/images/`.
7. Confirmar sobre `main` y revisar CI.
8. Verificar la entrada en `/blog/` y en su ruta individual.

La ruta se genera automáticamente desde el nombre del archivo o el slug definido por la colección.

## Agregar una receta

1. Crear un Markdown en `src/content/recipes/`.
2. Copiar una receta existente como base.
3. Completar título, descripción, fechas, imagen y texto alternativo.
4. Cargar `ingredients` e `instructions` como listas YAML.
5. Agregar tiempos y rendimiento solo cuando estén comprobados.
6. No inventar cantidades, advertencias alimentarias, propiedades médicas o valores nutricionales.
7. Confirmar sobre `main`.
8. Revisar CI, `/recetas/` y la ruta nueva.

## Cambiar o agregar una imagen

1. Optimizar la imagen en JPEG, PNG, WebP o AVIF.
2. Eliminar metadatos privados cuando existan.
3. Usar nombre descriptivo, minúsculo y con guiones.
4. Subirla a `public/images/`.
5. Evitar archivos mayores a 25 MiB; para web normalmente deben ser mucho menores.
6. Actualizar `image` y `imageAlt` en el contenido o componente.
7. Confirmar que CI valida existencia, tamaño y referencias.
8. No volver a usar rutas `/wp-content/uploads`, dominios heredados o imágenes remotas no controladas.

## Cambiar datos generales

- Identidad y configuración: `src/data/site.ts`.
- Navegación: `src/data/navigation.ts`.
- Redes o contacto: `src/data/social.ts` cuando exista evidencia pública válida.
- Redirecciones: `src/data/redirects.ts`, `astro.config.mjs` y `public/_redirects`.
- Estilos globales: `src/styles/global.css`.
- Componentes: `src/components/`.

No agregar teléfonos, correos, domicilios, testimonios, precios o redes sociales sin una fuente pública confirmada.

## Cambiar una ruta

1. Crear o mover el contenido correspondiente.
2. Actualizar navegación si la ruta debe ser visible.
3. Agregar una redirección permanente desde la ruta anterior.
4. Actualizar `docs/ROUTE-MAP.md`.
5. Revisar canonical, sitemap y enlaces internos.
6. Confirmar en `main` y revisar CI.
7. Verificar la redirección y la ruta pública.

Eliminar una ruta sin redirección rompe enlaces existentes y SEO.

## Revisar GitHub Actions

1. Abrir **Actions**.
2. Seleccionar **CI**.
3. Elegir el run asociado al último commit de `main`.
4. Verificar el SHA y que `Validate static site` esté verde.
5. Ante un fallo, abrir el primer step rojo.
6. Corregir la causa; no omitir la prueba.
7. Descargar artefactos cuando sea necesario:
   - `shekinah-dist-<SHA>`: build generado;
   - `playwright-report-<SHA>`: diagnóstico de navegador.

## Revisar Cloudflare

La integración Git de Cloudflare es el mecanismo normal.

1. Abrir **Workers & Pages → shekinah → Deployments**.
2. Localizar el deployment asociado al último commit de `main`.
3. Verificar que build y deploy terminaron correctamente.
4. Abrir el dominio estable `https://shekinah-7dl.pages.dev`.
5. Revisar la ruta modificada, navegación, imágenes y consola.

Configuración requerida:

```text
Production branch: main
Build command: npm run build
Deploy command: npx wrangler pages deploy dist --project-name shekinah --branch main
Root directory: /
SITE_URL: https://shekinah-7dl.pages.dev
```

No usar `npx wrangler deploy`.

## Workflow manual de respaldo

Solo ante contingencia:

1. configurar en GitHub Actions `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`;
2. abrir **Actions → Deploy Cloudflare Pages**;
3. pulsar **Run workflow** desde `main`;
4. verificar el job y la URL resultante;
5. evitar que este mecanismo quede automático en paralelo con Cloudflare Git Integration.

## Desarrollo local opcional

Requisitos:

- Node.js 24 o superior;
- npm 11 o compatible.

```bash
git clone https://github.com/JerePrograma/shekinah.git
cd shekinah
npm ci
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

El desarrollo local no debe utilizar los adjuntos originales, PHP, WordPress, Docker o una base de datos.

## Flujo de uso del sitio publicado

1. Entrar a la portada.
2. Usar la navegación principal para acceder a Nosotros, Tienda, Blog y Recetas.
3. En Tienda, consultar el catálogo informativo; no existe checkout ni pago.
4. En Blog, abrir las publicaciones disponibles.
5. En Recetas, abrir las recetas recuperadas.
6. Consultar la página legal desde su enlace correspondiente.
7. En móvil, abrir y cerrar el menú mediante el botón de navegación.

No existen usuarios, inicio de sesión, panel administrativo, carrito, pedidos, pagos ni base de datos.

## Criterio para considerar un cambio publicado

Un cambio está publicado solo cuando:

1. el commit existe en `main`;
2. CI está verde para ese SHA;
3. Cloudflare publicó ese mismo SHA;
4. la URL pública muestra el cambio;
5. no hay errores relevantes de navegación, imágenes, SEO o consola.
