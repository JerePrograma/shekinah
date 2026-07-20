# Despliegue en Cloudflare Pages

## Ruta principal: GitHub Actions + Wrangler

El repositorio contiene un workflow separado que espera a que `CI` finalice correctamente en `main` y despliega `dist` con Wrangler.

### 1. Crear el proyecto desde la web

1. Ingresar a Cloudflare Dashboard.
2. Abrir **Workers & Pages**.
3. Crear un proyecto Pages llamado exactamente **`shekinah`**.
4. Elegir **Direct Upload** si el despliegue quedará a cargo de GitHub Actions.

No mezclar este proyecto con integración Git automática: Cloudflare documenta que un proyecto Git-integrated no puede convertirse después en Direct Upload.

### 2. Crear credenciales

En Cloudflare, crear un API Token con permisos mínimos para editar Cloudflare Pages en la cuenta elegida. Copiar también el Account ID.

### 3. Configurar GitHub

En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**.

Crear:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### 4. Publicar

Una actualización de `main` ejecuta CI. Cuando CI pasa, `Deploy Cloudflare Pages` construye el mismo commit, audita `dist` y ejecuta:

```bash
npx wrangler pages deploy dist --project-name shekinah --branch main
```

El workflow verifica la portada publicada. Sin secretos, el trabajo se marca como omitido de forma informativa y CI sigue funcionando.

## Alternativa: integración Git de Cloudflare

También puede conectarse `JerePrograma/shekinah` desde el dashboard, con:

- rama de producción: `main`;
- comando de build: `npm run build`;
- directorio de salida: `dist`;
- versión Node: 24.

No debe habilitarse simultáneamente con el workflow de Direct Upload para evitar despliegues duplicados.

## Dominio y canonical

El proyecto presupone `https://shekinah.pages.dev`. Si Cloudflare asigna otra URL o se agrega un dominio personalizado:

1. configurar `SITE_URL` en el workflow/build;
2. actualizar `public/robots.txt`;
3. ejecutar CI y revisar canonical, sitemap y Open Graph.

## Estado actual

No se dispone de autenticación Cloudflare en este entorno. No se creó proyecto ni se verificó una URL pública. La configuración está preparada y no requiere acciones locales.

## Fuentes oficiales

- Cloudflare Pages, Direct Upload con CI: <https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/>
- Integración Git: <https://developers.cloudflare.com/pages/configuration/git-integration/>
- Astro estático no necesita adaptador Cloudflare: <https://docs.astro.build/en/guides/integrations-guide/cloudflare/>
