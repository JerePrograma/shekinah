# Operación y mantenimiento de Shekinah

El sitio puede editarse, validarse y publicarse íntegramente desde GitHub. Una instalación local es opcional y no constituye una dependencia operativa.

## Flujo habitual

1. Editar o crear archivos desde GitHub.
2. Confirmar el cambio directamente en `main`.
3. Abrir la pestaña **Actions**.
4. Esperar que el workflow **CI** termine en verde.
5. Si Cloudflare está configurado, comprobar que **Deploy Cloudflare Pages** termine en verde.
6. Abrir el sitio publicado y revisar la ruta modificada.

Un push a `main` es la única acción habitual de publicación.

## Cambiar un texto existente

1. En el repositorio, abrir `src/content/`.
2. Elegir `pages`, `posts` o `recipes`.
3. Abrir el Markdown correspondiente.
4. Pulsar **Edit this file**.
5. Modificar el cuerpo.
6. Cambiar el frontmatter YAML solo cuando se necesite actualizar título, descripción, fecha, imagen, etiquetas o SEO.
7. Pulsar **Commit changes**.
8. Seleccionar commit directo a `main`.
9. Revisar CI.

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

La ruta se genera automáticamente desde el nombre del archivo o el slug definido por la colección.

## Agregar una receta

1. Crear un Markdown en `src/content/recipes/`.
2. Copiar una receta existente como base.
3. Completar título, descripción, fechas, imagen y texto alternativo.
4. Cargar `ingredients` e `instructions` como listas YAML.
5. Agregar tiempos y rendimiento solo cuando estén comprobados.
6. No inventar cantidades, advertencias alimentarias, propiedades médicas o valores nutricionales.
7. Confirmar sobre `main` y revisar la ruta en `/recetas/`.

## Cambiar o agregar una imagen

1. Optimizar previamente la imagen en JPEG, PNG, WebP o AVIF.
2. Eliminar metadatos privados cuando existan.
3. Usar nombre descriptivo, minúsculo y con guiones.
4. Subirla a `public/images/` desde GitHub.
5. Evitar archivos mayores a 25 MiB; para web normalmente deberían ser mucho menores.
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
6. Ejecutar CI.

Eliminar una ruta sin redirección rompe enlaces existentes y SEO.

## Revisar GitHub Actions

1. Abrir **Actions**.
2. Seleccionar **CI**.
3. Elegir el run asociado al último commit de `main`.
4. Verificar el SHA y que `Validate static site` esté verde.
5. Ante un fallo, abrir el primer step rojo.
6. Corregir la causa; no omitir la prueba.
7. Descargar los artefactos cuando sea necesario:
   - `shekinah-dist-<SHA>`: build generado;
   - `playwright-report-<SHA>`: diagnóstico de navegador.

## Publicación en Cloudflare

Cuando los secretos estén configurados, el workflow de despliegue se ejecuta después de CI. Para ejecutarlo manualmente:

1. Abrir **Actions**.
2. Seleccionar **Deploy Cloudflare Pages**.
3. Pulsar **Run workflow**.
4. Elegir `main`.
5. Confirmar la ejecución.
6. Verificar la URL registrada en el environment `cloudflare-pages-production`.

## Desarrollo local opcional

Requisitos:

- Node.js 24 LTS;
- npm 11 o compatible.

Comandos:

```bash
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

## Criterio para considerar un cambio publicado

Un cambio está publicado solo cuando:

1. el commit existe en `main`;
2. CI está verde para ese SHA;
3. el deploy está verde para ese SHA, si Cloudflare está configurado;
4. la URL pública muestra el cambio;
5. no hay errores de navegación, imágenes, SEO o consola relevantes.
