# Mantenimiento desde GitHub

No hace falta instalar nada en una computadora para editar o publicar contenido.

## Cambiar un texto

1. Abrir el archivo correspondiente dentro de `src/content/` en GitHub.
2. Pulsar el ícono de edición.
3. Modificar el cuerpo sin alterar el bloque YAML inicial salvo que corresponda.
4. Usar **Commit changes** y confirmar sobre `main`.
5. Revisar la pestaña Actions.

## Agregar una publicación

1. Crear `src/content/posts/mi-slug.md`.
2. Copiar la estructura de una entrada existente.
3. Completar título, slug, descripción, fechas, categorías, etiquetas, imagen y texto alternativo.
4. Usar una imagen dentro de `public/images/`.
5. Mantener `source` con un ID/URL real cuando el contenido sea migrado; para contenido nuevo, primero debe adaptarse el esquema o registrarse claramente su origen editorial.

## Agregar una receta

Crear un Markdown en `src/content/recipes/` con `ingredients` e `instructions` como listas YAML. No publicar cantidades o advertencias alimentarias sin revisión.

## Cambiar una imagen

1. Subir el archivo optimizado a `public/images/`.
2. Usar nombre minúsculo y descriptivo.
3. Evitar archivos mayores a 25 MiB.
4. Actualizar la ruta y `imageAlt` en el contenido o componente.
5. Confirmar que CI valida referencias y tamaño.

## Cambiar datos globales

- identidad/contacto: `src/data/site.ts`;
- navegación: `src/data/navigation.ts`;
- redirecciones: `src/data/redirects.ts`, `astro.config.mjs` y `public/_redirects`.

## Publicar

El único flujo habitual es confirmar cambios en `main`. CI valida. Si Cloudflare está configurado, el workflow de despliegue publica después.

## Verificar Cloudflare

1. Abrir Actions y confirmar CI verde.
2. Confirmar `Deploy Cloudflare Pages` verde o `Deployment not configured`.
3. En Cloudflare → Workers & Pages → `shekinah`, revisar el SHA del despliegue.
4. Abrir la URL y comprobar portada, navegación, blog, recetas y términos.
