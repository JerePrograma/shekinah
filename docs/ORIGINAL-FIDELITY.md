# Fidelidad visual y funcional

Fecha de actualización: **2026-07-22**.

## Objetivo

La aplicación React/TypeScript conserva como fuente de verdad el código versionado, pero reutiliza los archivos visuales recuperados del snapshot WordPress publicado previamente. El snapshot no vuelve a formar parte del build ni del despliegue.

## Imágenes restauradas

Se recuperaron imágenes originales para:

- portada y secciones destacadas;
- página Nosotros;
- artículos sobre especias y romero;
- receta de chocolate casero;
- receta de barras de cereal.

Los archivos están versionados bajo `public/images/original/` y su asignación semántica se mantiene en `src/originalMedia.ts`.

## Funcionalidad restaurada

- galerías originales por contenido;
- ampliación de imágenes mediante diálogo accesible;
- navegación de galería con flechas, botones y teclado;
- cierre con Escape;
- testimonios recuperados donde existían en la fuente;
- menú móvil cerrable con Escape;
- acción de consulta por correo en Tienda.

## Límites comprobados

La página Tienda recuperada no contenía productos, precios, carrito, checkout ni procesamiento de pedidos. Esas funciones no se simulan ni se inventan. La consulta comercial se mantiene mediante correo electrónico.

No se restauran scripts de WordPress, plugins de Hostinger, endpoints PHP, comentarios, formularios dinámicos ni dependencias de base de datos.
