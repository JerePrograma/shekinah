# Despliegue en Cloudflare Pages

Fecha de actualización: **2026-07-21**.

## Arquitectura de publicación definitiva

La ruta principal es **integración Git nativa de Cloudflare Pages**.

```text
commit en main
  → GitHub Actions ejecuta CI
  → Cloudflare detecta el push
  → clona JerePrograma/shekinah
  → npm install / npm ci según su configuración
  → npm run build
  → publica dist
  → https://shekinah-7dl.pages.dev
```

El workflow `.github/workflows/deploy-cloudflare.yml` queda como **respaldo manual**. No se ejecuta automáticamente y no debe habilitarse en paralelo como segundo publicador habitual.

No intervienen WordPress, PHP, base de datos, Docker, Hostinger, una computadora encendida ni los adjuntos originales.

## Estado actual observado

- Proyecto Cloudflare Pages: `shekinah`.
- Repositorio conectado: `JerePrograma/shekinah`.
- Rama de producción: `main`.
- Dominio estable asignado: `https://shekinah-7dl.pages.dev`.
- El build de Astro observado completó correctamente y generó las páginas y el sitemap.
- El despliegue falló porque el panel tenía `npx wrangler deploy`, comando para Workers.

El error no requiere crear un Worker, `src/index.ts`, un entry point ni `assets.directory`.

## Configuración exacta en Cloudflare

Abrir **Workers & Pages → shekinah → Settings → Build** y establecer:

| Campo | Valor |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler pages deploy dist --project-name shekinah --branch main` |
| Root directory | `/` |

Variable de build:

| Nombre | Valor |
| --- | --- |
| `SITE_URL` | `https://shekinah-7dl.pages.dev` |

No usar:

```bash
npx wrangler deploy
```

Ese comando busca una aplicación Cloudflare Worker y no corresponde a este sitio estático.

## Ejecutar el primer despliegue válido

1. Guardar los cambios de configuración.
2. Abrir **Deployments**.
3. Seleccionar el último despliegue fallido.
4. Pulsar **Retry deployment**.
5. Confirmar que `npm run build` termina correctamente.
6. Confirmar que `wrangler pages deploy dist` publica el directorio `dist`.
7. Abrir el dominio estable:

   ```text
   https://shekinah-7dl.pages.dev
   ```

8. Verificar que el deployment corresponde al SHA actual de `main`.

También puede provocarse un nuevo deployment mediante un commit válido en `main`.

## Verificación funcional obligatoria

Revisar:

- `/`;
- `/nosotros/`;
- `/tienda/`;
- `/blog/`;
- `/recetas/`;
- `/chocolate-casero/`;
- `/receta-barra-de-cereal/`;
- `/terms-and-conditions/`;
- `/404.html`;
- navegación de escritorio y móvil;
- imágenes y textos alternativos;
- enlaces internos;
- redirecciones históricas;
- `robots.txt`;
- `sitemap-index.xml`;
- canonical y Open Graph en el HTML.

Un deployment no se considera aprobado solo porque Cloudflare lo marque verde: debe abrirse la URL y verificarse el contenido.

## URL estable y URL de despliegue

Cloudflare puede mostrar una URL individual similar a:

```text
https://4f2c4182.shekinah-7dl.pages.dev
```

Esa URL identifica un deployment concreto. La URL estable de producción es:

```text
https://shekinah-7dl.pages.dev
```

El repositorio ya utiliza esa URL en:

- `astro.config.mjs`;
- `public/robots.txt`;
- `.github/workflows/ci.yml`;
- `.github/workflows/deploy-cloudflare.yml`.

## TLS y certificado

No diagnosticar el certificado de manera definitiva mientras el deploy siga fallando. Después del primer deployment válido:

1. abrir el dominio estable;
2. recargar sin caché;
3. probar en una ventana privada;
4. revisar el estado del dominio y certificado en Cloudflare si el error continúa.

## Despliegue manual de respaldo desde GitHub Actions

Usar únicamente cuando la integración Git no pueda publicar o cuando se decida cambiar deliberadamente el mecanismo.

### Configurar secretos

En **GitHub → JerePrograma/shekinah → Settings → Secrets and variables → Actions** crear:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

El token debe tener el permiso mínimo necesario para Cloudflare Pages. No usar la Global API Key ni publicar estos valores.

### Ejecutar

1. Abrir **Actions**.
2. Seleccionar **Deploy Cloudflare Pages**.
3. Pulsar **Run workflow**.
4. Ejecutarlo desde `main`.
5. El workflow obtiene `main`, instala dependencias, ejecuta `npm run verify`, publica `dist` y verifica la portada.

Comando de publicación:

```bash
npx wrangler pages deploy dist --project-name shekinah --branch main
```

## Despliegue manual desde una terminal opcional

Solo para operadores con Node.js 24, npm 11, Wrangler autenticado y permisos sobre el proyecto:

```bash
git clone https://github.com/JerePrograma/shekinah.git
cd shekinah
npm ci
npm run deploy
```

`npm run deploy` ejecuta primero todos los controles y luego publica `dist` en el proyecto `shekinah`, rama `main`.

Este flujo no es necesario para el funcionamiento habitual.

## Evitar despliegues duplicados

Usar un solo publicador automático:

- **seleccionado:** integración Git de Cloudflare;
- **respaldo manual:** GitHub Actions;
- **no permitido:** ambos ejecutándose automáticamente para cada push.

Dos mecanismos automáticos producen deployments duplicados, estados contradictorios y dificultad para relacionar la versión pública con un SHA.

## Dominio propio futuro

Al asociar un dominio propio:

1. configurar el dominio en Cloudflare Pages;
2. actualizar el fallback `site` de `astro.config.mjs`;
3. actualizar `public/robots.txt`;
4. actualizar `SITE_URL` en CI y workflow manual;
5. confirmar el cambio en `main`;
6. esperar CI y deployment verdes;
7. revisar canonical, Open Graph y sitemap;
8. conservar `pages.dev` como respaldo salvo decisión explícita contraria.

## Solución de problemas

### El panel pide un Worker o entry point

El comando continúa siendo `npx wrangler deploy`. Sustituirlo por `npx wrangler pages deploy dist --project-name shekinah --branch main`.

### El build funciona y el deploy falla

Separar ambas etapas. Un build Astro verde demuestra que el código compila; revisar comando, proyecto, cuenta y permisos de Cloudflare.

### Wrangler indica proyecto inexistente

Confirmar que el proyecto se llama exactamente `shekinah` y que pertenece a la cuenta usada.

### Error de autorización

Revisar alcance, cuenta y vigencia del token. No ampliar permisos indiscriminadamente.

### El sitio no coincide con `main`

Comparar el SHA del deployment de Cloudflare con el HEAD de `main`. No validar solo por fecha.

### `Deployment not configured` en GitHub Actions

El workflow manual no tiene ambos secretos. Esto no afecta la integración Git de Cloudflare ni el CI.

## Criterio de cierre

El despliegue queda cerrado cuando:

1. Cloudflare construye y publica sin errores;
2. `https://shekinah-7dl.pages.dev` responde correctamente;
3. las rutas y recursos principales funcionan;
4. robots, sitemap y canonical usan el dominio estable;
5. el SHA público coincide con `main`;
6. el resultado queda registrado en `docs/MIGRATION-STATUS.md`.

## Fuentes oficiales

- Cloudflare Pages Git integration: <https://developers.cloudflare.com/pages/configuration/git-integration/>
- Cloudflare Pages Direct Upload con CI: <https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/>
- Wrangler Pages deploy: <https://developers.cloudflare.com/workers/wrangler/commands/#pages-deploy>
- Astro y Cloudflare: <https://docs.astro.build/en/guides/integrations-guide/cloudflare/>
