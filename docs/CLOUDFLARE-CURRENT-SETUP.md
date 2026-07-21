# Diagnóstico actual de Cloudflare para Shekinah

Fecha de diagnóstico: **2026-07-21**.

## Evidencia observada

- Repositorio conectado: `JerePrograma/shekinah`.
- Rama utilizada: `main`.
- Dominio estable identificado: `https://shekinah-7dl.pages.dev`.
- El build observado instaló dependencias, ejecutó `npm run build`, generó 11 páginas y creó `dist/sitemap-index.xml`.
- La etapa siguiente ejecutó:

  ```bash
  npx wrangler deploy
  ```

- Wrangler buscó un entry point de Worker inexistente y el despliegue falló.

## Diagnóstico corregido

`npx wrangler deploy` es el comando de despliegue de **Cloudflare Workers**.

Un proyecto Pages con integración Git se configura mediante:

- production branch;
- build command;
- build output directory;
- root directory;
- variables de entorno.

Por lo tanto, un panel que exige **Deploy command** y propone `npx wrangler deploy` corresponde a **Workers Builds** o a una configuración distinta del Pages Git build tradicional.

El sitio Shekinah es estático y su destino correcto es Cloudflare Pages. No debe agregarse un Worker ficticio, `src/index.ts`, un entry point ni `assets.directory` para satisfacer ese comando.

## Decisión adoptada

Se usa un solo flujo controlado desde GitHub:

```text
push a main
  → GitHub Actions ejecuta CI
  → CI verde
  → GitHub Actions obtiene el mismo SHA
  → npm run verify
  → wrangler pages deploy dist
  → Cloudflare Pages
```

Comando exacto:

```bash
npx wrangler pages deploy dist \
  --project-name shekinah \
  --branch main \
  --commit-hash <SHA_VALIDADO>
```

## Qué hacer en Cloudflare

1. Abrir **Workers & Pages**.
2. Localizar el recurso asociado a `shekinah-7dl.pages.dev`.
3. Confirmar que es un proyecto **Pages** llamado `shekinah`.
4. Si Pages tiene integración Git automática, deshabilitar deployments automáticos de producción y preview.
5. Si existe además un recurso Worker conectado a `JerePrograma/shekinah`, revisar que no contenga otro servicio válido.
6. Desconectar o eliminar ese Worker solo después de esa comprobación.
7. No reemplazar su deploy command por otro comando como solución permanente; el publicador canónico está en GitHub Actions.

## Qué hacer en GitHub

Crear en **Settings → Secrets and variables → Actions**:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

El token debe limitarse a la cuenta y al permiso necesario para editar Pages.

Después:

1. ejecutar **Actions → CI → Run workflow** sobre `main`;
2. corregir cualquier fallo;
3. confirmar el run automático **Deploy Cloudflare Pages**;
4. ejecutar ese workflow manualmente si no se inicia;
5. abrir el environment `cloudflare-pages-production`;
6. verificar el dominio estable y el SHA.

## URL aplicada en el repositorio

El repositorio utiliza `https://shekinah-7dl.pages.dev` en:

- fallback `site` de `astro.config.mjs`;
- `public/robots.txt`;
- variable `SITE_URL` de CI;
- variable `SITE_URL` y fallback de verificación del workflow de Pages.

## TLS y URL de deployment

Cloudflare puede generar una URL individual similar a:

```text
https://<hash>.shekinah-7dl.pages.dev
```

La URL estable es:

```text
https://shekinah-7dl.pages.dev
```

No diagnosticar definitivamente TLS o DNS mientras no exista un deployment Pages válido. Después del primer deployment exitoso:

1. abrir el dominio estable;
2. recargar sin caché;
3. probar en una ventana privada;
4. revisar el estado del dominio y del certificado si el error continúa.

## Controles de cierre

- CI verde para el HEAD de `main`;
- workflow de Pages verde para el mismo SHA;
- dominio estable accesible;
- portada, rutas, imágenes, robots y sitemap correctos;
- SHA de Cloudflare coincidente con el SHA validado;
- ningún Worker o publicador automático paralelo conectado accidentalmente.
