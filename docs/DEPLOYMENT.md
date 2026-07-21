# Despliegue en Cloudflare Pages

Fecha de actualización: **2026-07-21**.

## Arquitectura de publicación definitiva

La ruta principal es **GitHub Actions + Wrangler + Cloudflare Pages**.

```text
commit en main
  → GitHub Actions: CI
  → npm ci + check + lint + formato + build + pruebas + auditorías
  → CI verde
  → GitHub Actions: Deploy Cloudflare Pages
  → checkout del mismo SHA validado
  → npm run verify
  → wrangler pages deploy dist
  → verificación HTTP de la portada
```

No intervienen WordPress, PHP, base de datos, Docker, Hostinger, una computadora encendida ni los adjuntos originales.

## Por qué se eligió este flujo

Cloudflare tiene dos mecanismos distintos que no deben mezclarse:

- **Pages Git Integration:** recibe un build command y un build output directory; Pages sube ese directorio automáticamente.
- **Workers Builds:** recibe un build command y un deploy command cuyo valor predeterminado es `npx wrangler deploy`.

El sitio Shekinah es un proyecto estático de **Pages**, no un Worker. El comando `npx wrangler deploy` intenta desplegar un Worker y por eso busca un entry point inexistente.

Para eliminar la ambigüedad, el repositorio controla la validación y la publicación con:

```bash
npx wrangler pages deploy dist --project-name shekinah --branch main
```

## Estado diagnosticado

- Repositorio: `JerePrograma/shekinah`.
- Rama de producción: `main`.
- Proyecto Pages esperado: `shekinah`.
- Dominio estable asignado: `https://shekinah-7dl.pages.dev`.
- El build Astro observado anteriormente completó correctamente.
- El despliegue observado falló al ejecutar `npx wrangler deploy`, comando de Workers.
- El estado público actual debe volver a verificarse después del primer workflow exitoso.

## Paso 1 — Identificar el recurso correcto en Cloudflare

1. Abrir **Workers & Pages**.
2. Buscar el proyecto que posee el dominio `shekinah-7dl.pages.dev`.
3. Confirmar que su tipo es **Pages**.
4. Confirmar que el nombre utilizado por la API es `shekinah`.

Si aparece además un recurso Worker conectado a `JerePrograma/shekinah` y su configuración incluye:

```text
Deploy command: npx wrangler deploy
```

ese recurso no es el publicador correcto para este sitio. Desconectarlo del repositorio o eliminarlo solo después de comprobar que no contiene otro servicio válido.

## Paso 2 — Evitar publicaciones duplicadas

Si el proyecto Pages tiene integración Git automática:

1. abrir el proyecto Pages;
2. ir a **Settings → Builds → Branch control**;
3. deshabilitar los deployments automáticos de producción y preview;
4. conservar el proyecto y su dominio;
5. dejar a GitHub Actions como único publicador automático.

No deben coexistir dos mecanismos automáticos para cada push.

## Paso 3 — Obtener el Account ID

1. Abrir la cuenta correcta de Cloudflare.
2. Copiar el **Account ID** desde la información general o la sección de API.
3. No publicarlo en commits, issues o documentación pública.

## Paso 4 — Crear un API Token

1. Abrir el perfil de Cloudflare.
2. Entrar en **API Tokens**.
3. Crear un token personalizado.
4. Limitarlo a la cuenta correcta.
5. Otorgar solamente el permiso necesario para editar Cloudflare Pages.
6. Copiar el token al crearlo.

No usar la Global API Key.

## Paso 5 — Guardar secretos en GitHub

En `JerePrograma/shekinah`:

1. abrir **Settings**;
2. abrir **Secrets and variables**;
3. elegir **Actions**;
4. pulsar **New repository secret**;
5. crear exactamente:

   ```text
   CLOUDFLARE_API_TOKEN
   CLOUDFLARE_ACCOUNT_ID
   ```

6. comprobar mayúsculas, nombres y valores;
7. no almacenar esos datos en archivos del repositorio.

## Paso 6 — Ejecutar CI

1. Abrir **Actions**.
2. Seleccionar **CI**.
3. Pulsar **Run workflow**.
4. Elegir `main`.
5. Ejecutar.
6. Abrir el job **Validate static site**.
7. Confirmar que terminan en verde:
   - `npm ci`;
   - instalación de Chromium;
   - Astro y TypeScript;
   - ESLint;
   - Prettier;
   - build;
   - pruebas unitarias y Playwright;
   - auditoría de salida;
   - auditoría de secretos.

No continuar con un CI rojo.

## Paso 7 — Desplegar

Después de un CI verde en `main`, el workflow **Deploy Cloudflare Pages** se inicia automáticamente.

También puede iniciarse manualmente:

1. abrir **Actions**;
2. seleccionar **Deploy Cloudflare Pages**;
3. pulsar **Run workflow**;
4. ejecutar desde `main`.

El workflow:

1. verifica que existan ambos secretos;
2. resuelve el SHA que aprobó CI;
3. hace checkout de ese SHA;
4. ejecuta `npm ci`;
5. instala Chromium;
6. ejecuta `npm run verify`;
7. publica `dist` con Wrangler;
8. asocia el SHA al deployment;
9. descarga la portada publicada y comprueba su `<title>`.

## Comando de publicación

```bash
npx wrangler pages deploy dist \
  --project-name shekinah \
  --branch main \
  --commit-hash <SHA_VALIDADO>
```

El directorio publicado es `dist`.

## Paso 8 — Verificación pública

Abrir el dominio estable:

```text
https://shekinah-7dl.pages.dev
```

Verificar:

- `/`;
- `/nosotros/`;
- `/tienda/`;
- `/blog/`;
- `/recetas/`;
- `/chocolate-casero/`;
- `/receta-barra-de-cereal/`;
- `/terms-and-conditions/`;
- `/404.html`;
- `/robots.txt`;
- `/sitemap-index.xml`;
- navegación de escritorio y móvil;
- imágenes y textos alternativos;
- redirecciones históricas;
- canonical y Open Graph.

Un workflow verde no reemplaza esta revisión pública.

## Verificar el SHA

1. Abrir el run de **CI** y copiar su SHA.
2. Abrir el run de **Deploy Cloudflare Pages**.
3. Confirmar que hizo checkout del mismo SHA.
4. Abrir el deployment en Cloudflare.
5. Confirmar que el SHA asociado coincide.

No validar únicamente por fecha o contenido visual.

## Desarrollo y despliegue desde terminal

El flujo normal no requiere una terminal local. Para una ejecución opcional:

```bash
git clone https://github.com/JerePrograma/shekinah.git
cd shekinah
npm ci
npm run verify
npm run deploy
```

Se requiere Node.js 24, npm 11, Wrangler autenticado y permisos sobre la cuenta.

## Cuando faltan secretos

El CI principal sigue funcionando. El workflow de despliegue muestra `Deployment not configured` y no intenta publicar.

Esto significa que falta infraestructura autorizada, no que Astro esté roto.

## URL y dominio propio

El repositorio utiliza:

```text
https://shekinah-7dl.pages.dev
```

Si se agrega un dominio propio:

1. configurarlo en Cloudflare Pages;
2. actualizar el fallback `site` de `astro.config.mjs`;
3. actualizar `public/robots.txt`;
4. actualizar `SITE_URL` en los workflows;
5. confirmar el cambio en `main`;
6. ejecutar CI y despliegue;
7. verificar canonical, Open Graph y sitemap.

## Rollback

1. revertir el commit problemático en `main`;
2. esperar CI verde;
3. dejar que el workflow publique el commit de reversión;
4. usar temporalmente un deployment anterior desde Cloudflare cuando sea necesario;
5. confirmar nuevamente la coincidencia de SHA.

Guía completa: [`ROLLBACK.md`](ROLLBACK.md).

## Solución de problemas

### `Deployment not configured`

Falta uno o ambos secretos, o sus nombres son incorrectos.

### `wrangler deploy` pide un entry point

Se está ejecutando el comando de Workers. El workflow correcto usa `wrangler pages deploy dist`.

### Wrangler no encuentra el proyecto

Confirmar que el proyecto Pages se llama exactamente `shekinah` y pertenece a la cuenta indicada por `CLOUDFLARE_ACCOUNT_ID`.

### Error de autorización

Revisar permiso Pages Edit, cuenta, vigencia y alcance del token. No ampliar permisos indiscriminadamente.

### El sitio no coincide con `main`

Comparar los SHA de CI, workflow de despliegue y Cloudflare.

### El dominio responde con error TLS o DNS

Comprobar primero que exista un deployment válido. Luego probar sin caché y revisar dominio, certificado y estado del proyecto en Cloudflare.

## Criterio de cierre

El despliegue queda cerrado cuando:

1. CI está verde para el HEAD de `main`;
2. el workflow de Pages está verde para el mismo SHA;
3. `https://shekinah-7dl.pages.dev` responde correctamente;
4. las rutas y recursos principales funcionan;
5. robots, sitemap y canonical usan el dominio estable;
6. el SHA público coincide con el SHA validado;
7. el resultado queda registrado en `docs/MIGRATION-STATUS.md`.

## Fuentes oficiales

- Cloudflare Pages Git integration: <https://developers.cloudflare.com/pages/configuration/git-integration/>
- Cloudflare Pages Direct Upload: <https://developers.cloudflare.com/pages/get-started/direct-upload/>
- Wrangler Pages commands: <https://developers.cloudflare.com/workers/wrangler/commands/pages/>
- Workers Builds configuration: <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>
