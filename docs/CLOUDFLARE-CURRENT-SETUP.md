# Configuración actual de Cloudflare para Shekinah

Fecha de diagnóstico: **2026-07-21**.

## Estado observado

El proyecto Cloudflare existente está conectado al repositorio GitHub `JerePrograma/shekinah` y usa la rama de producción `main`.

Cloudflare asignó el dominio estable:

```text
https://shekinah-7dl.pages.dev
```

El build identificado como `#696b8f2a` completó correctamente:

- clonación del repositorio;
- instalación de dependencias;
- `npm run build`;
- generación de 11 páginas;
- generación de `dist/sitemap-index.xml`.

El fallo ocurrió exclusivamente en el despliegue porque Cloudflare tenía configurado:

```bash
npx wrangler deploy
```

Ese comando despliega Workers y no corresponde a un proyecto Pages estático. Wrangler emitió la advertencia explícita y luego buscó un entry point de Worker inexistente.

## Configuración correcta en Cloudflare

En **Workers & Pages → shekinah → Settings → Build** configurar:

| Campo | Valor |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler pages deploy dist --project-name shekinah --branch main` |
| Root directory | `/` |

Agregar la variable de build:

| Nombre | Valor |
| --- | --- |
| `SITE_URL` | `https://shekinah-7dl.pages.dev` |

No configurar `npx wrangler deploy`, un archivo Worker `main`, `src/index.ts` ni `assets.directory`: el proyecto es Astro estático para Cloudflare Pages y su directorio publicable es `dist`.

## Reintento

Después de guardar la configuración:

1. abrir **Deployments**;
2. seleccionar el último build fallido;
3. ejecutar **Retry deployment** o iniciar un nuevo deploy de `main`;
4. confirmar que `npm run build` finalice correctamente;
5. confirmar que el comando `wrangler pages deploy` publique `dist`;
6. abrir primero el dominio estable `https://shekinah-7dl.pages.dev`;
7. verificar portada, rutas, imágenes, robots y sitemap.

## TLS y URL con hash

La URL similar a:

```text
https://4f2c4182.shekinah-7dl.pages.dev
```

corresponde a un despliegue individual. El dominio estable de producción es:

```text
https://shekinah-7dl.pages.dev
```

No se debe diagnosticar definitivamente el certificado mientras el despliegue continúe fallando. Después del primer deploy válido, esperar la provisión del certificado, recargar sin caché y probar en una ventana privada. Si el error TLS continúa, revisar el estado del dominio y del certificado en Cloudflare.

## Flujo elegido

Se conserva la integración Git ya creada en Cloudflare:

```text
push a main
  → Cloudflare clona JerePrograma/shekinah
  → npm run build
  → wrangler pages deploy dist
  → shekinah-7dl.pages.dev
```

Para evitar despliegues duplicados, no configurar simultáneamente los secretos del workflow GitHub `Deploy Cloudflare Pages` mientras Cloudflare mantenga despliegues automáticos por integración Git. El workflow puede permanecer sin secretos y se marcará como no configurado.

## URL aplicada en el repositorio

El repositorio usa `https://shekinah-7dl.pages.dev` en:

- fallback `site` de `astro.config.mjs`;
- `public/robots.txt`;
- variable `SITE_URL` de CI;
- variable `SITE_URL` y fallback de verificación del workflow de Cloudflare.
