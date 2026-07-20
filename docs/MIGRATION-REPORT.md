# Informe de migración

## Resultado

Se transformó una instalación recuperada en un sitio Astro de generación estática. El build final depende solo del repositorio, Node.js y npm.

## Evidencia analizada

- 2 dumps SQL de la misma base.
- 1 ZIP completo de archivos del sitio.
- 1 exportación WXR.

## Recuperación de contenido

- Registros publicados de página encontrados: **9**.
- Páginas/rutas canónicas materializadas: **8**; una duplicada se redirige.
- Entradas útiles migradas: **2**.
- Entrada de demostración descartada: **1**.
- Auto-borrador descartado: **1**.
- Recetas reclasificadas desde páginas: **2**.
- Página legal canónica: **1**.
- Borrador de privacidad genérico: no publicado.

## Recuperación de medios

- Adjuntos registrados: **20**.
- Adjuntos originales localizados: **20**.
- Archivos y variantes en uploads: **98**.
- Medios finales optimizados: **5**.
- Imágenes externas referenciadas: **19**; ninguna queda como dependencia activa.

## Elementos descartados

- Núcleo, temas, plugins y PHP.
- `wp-config.php`, `.htaccess`, logs y configuración privada.
- Base de datos y dumps.
- hashes de contraseña, sesiones, tokens y usuarios.
- metadatos Hostinger/LiteSpeed.
- comentarios de bloques y estilos inline inseguros.
- contenido de demostración, auto-drafts y plantilla legal duplicada.
- rutas administrativas y recursos del dominio anterior.

## Decisiones técnicas

- Astro 7 estático, sin adaptador de servidor.
- Node 24 LTS en CI.
- Contenido Markdown tipado con Content Collections.
- CSS propio; sin React, Tailwind o librería visual.
- Tienda como catálogo informativo por ausencia de evidencia de comercio electrónico.
- Página Inicio como portada pese al ajuste heredado `show_on_front=posts`.
- Datos legales conservados solo porque estaban en una página pública específica.
- Afirmaciones de bienestar editadas para no presentarlas como consejo médico.

## Diferencias visuales

Se preservan paleta verde/dorada, emblema, firma, imágenes de especias, jerarquía editorial y tono de viaje/alquimia natural. La composición, navegación y responsive se rediseñaron. No se afirma pixel perfect porque no existe captura integral del sitio original ni una referencia ejecutable autorizada.

## Confianza

| Área                   | Confianza            |
| ---------------------- | -------------------- |
| Contenido publicado    | Alta                 |
| Rutas y slugs          | Alta                 |
| Medios locales         | Alta                 |
| Identidad de marca     | Media-alta           |
| Diseño exacto          | Media                |
| Catálogo/stock/precios | Baja; no recuperable |

## Pendientes

Solo quedan acciones de plataforma: completar secretos de Cloudflare, ejecutar el despliegue y verificar la URL. El producto no necesita la evidencia original para ninguna de esas tareas.
