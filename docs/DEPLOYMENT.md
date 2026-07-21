# Despliegue en Cloudflare Pages

## Arquitectura de publicación elegida

La ruta principal es **GitHub Actions + Wrangler + Cloudflare Pages Direct Upload**.

Flujo:

```text
commit en main
  → GitHub Actions: CI
  → npm ci + check + lint + formato + build + pruebas + auditorías
  → CI verde
  → GitHub Actions: Deploy Cloudflare Pages
  → build del mismo SHA
  → auditoría de dist
  → Wrangler publica en Cloudflare Pages
  → verificación HTTP de la portada
```

No intervienen WordPress, PHP, base de datos, Docker, Hostinger, una computadora encendida ni los adjuntos originales.

## Primera configuración desde la web

### Paso 1 — Crear el proyecto Pages

1. Ingresar a Cloudflare Dashboard.
2. Abrir **Workers & Pages**.
3. Elegir **Create application** o **Create**.
4. Elegir **Pages**.
5. Seleccionar **Direct Upload**.
6. Nombrar el proyecto exactamente `shekinah`.
7. Completar la creación aunque todavía no exista un primer archivo manual para subir, cuando la interfaz lo permita.

No conectar simultáneamente la integración Git de Cloudflare. El repositorio ya tiene su propia canalización de despliegue y dos mecanismos paralelos causarían publicaciones duplicadas.

### Paso 2 — Obtener el Account ID

1. Dentro de Cloudflare, abrir la cuenta correcta.
2. Copiar el **Account ID** desde la página de información general o la sección de API.
3. Guardarlo temporalmente para cargarlo como secreto de GitHub.

No publicarlo en issues, documentación o commits.

### Paso 3 — Crear el API Token

1. Abrir el perfil de Cloudflare.
2. Entrar en **API Tokens**.
3. Crear un token personalizado o usar la plantilla específica de Pages cuando esté disponible.
4. Conceder el permiso mínimo necesario para editar/desplegar Cloudflare Pages en la cuenta seleccionada.
5. Restringir el token a la cuenta correspondiente.
6. Crear y copiar el token una sola vez.

No usar la Global API Key. El token debe tener el menor alcance posible.

### Paso 4 — Guardar secretos en GitHub

En `JerePrograma/shekinah`:

1. Abrir **Settings**.
2. Abrir **Secrets and variables**.
3. Elegir **Actions**.
4. Pulsar **New repository secret**.
5. Crear exactamente:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

6. Verificar que los nombres no tengan espacios ni diferencias de mayúsculas.

### Paso 5 — Ejecutar el primer despliegue

Opción automática:

1. Confirmar un cambio válido en `main`.
2. Esperar CI verde.
3. El workflow de despliegue se dispara automáticamente.

Opción manual, sin cambiar código:

1. Abrir **Actions**.
2. Seleccionar **Deploy Cloudflare Pages**.
3. Pulsar **Run workflow**.
4. Elegir `main`.
5. Confirmar.

### Paso 6 — Verificar

1. Abrir el run de despliegue.
2. Confirmar que `Check deployment configuration` detectó ambos secretos.
3. Confirmar que `Deploy production build` terminó en verde.
4. Abrir la URL mostrada por el environment `cloudflare-pages-production`.
5. Verificar:
   - `/`;
   - `/nosotros/`;
   - `/tienda/`;
   - `/blog/`;
   - `/recetas/`;
   - las dos entradas;
   - las dos recetas;
   - `/terms-and-conditions/`;
   - navegación móvil;
   - imágenes;
   - 404.
6. En Cloudflare → Workers & Pages → `shekinah` confirmar que el despliegue corresponde al SHA validado.

## Comando ejecutado por CI

```bash
npx wrangler pages deploy dist --project-name shekinah --branch main
```

Antes de ese comando, el workflow vuelve a ejecutar `npm ci`, `npm run build` y `npm run audit:output` sobre el commit que pasó CI.

## Cuando faltan secretos

El CI principal sigue funcionando. El workflow de despliegue muestra un job informativo `Deployment not configured` y no intenta publicar. Esto no significa que el código esté roto; significa que la infraestructura todavía no fue autorizada.

## URL, dominio y canonical

El proyecto utiliza provisionalmente:

```text
https://shekinah.pages.dev
```

Debe considerarse una URL prevista hasta que Cloudflare confirme y se verifique el primer despliegue.

Si la URL real es diferente o se configura un dominio propio:

1. actualizar `SITE_URL` en `.github/workflows/ci.yml` y `.github/workflows/deploy-cloudflare.yml`;
2. actualizar `site` en `astro.config.mjs` si corresponde;
3. actualizar `public/robots.txt`;
4. revisar canonical, Open Graph y sitemap;
5. confirmar el cambio en `main`;
6. verificar CI y despliegue;
7. registrar la URL verificada en README, `docs/MIGRATION-STATUS.md` y este documento.

## Alternativa: integración Git nativa de Cloudflare

Solo elegirla si se decide retirar el workflow Wrangler.

Configuración:

- repositorio: `JerePrograma/shekinah`;
- rama de producción: `main`;
- comando: `npm run build`;
- salida: `dist`;
- Node: 24;
- instalación: `npm ci`.

No habilitar ambos mecanismos al mismo tiempo.

## Solución de problemas

### `Deployment not configured`

Falta uno o ambos secretos, o sus nombres son incorrectos.

### Wrangler indica proyecto inexistente

Crear `shekinah` como proyecto Pages Direct Upload en la cuenta asociada al `CLOUDFLARE_ACCOUNT_ID`.

### Error de autorización

Revisar alcance, cuenta y vigencia de `CLOUDFLARE_API_TOKEN`. No ampliar permisos indiscriminadamente sin comprobar primero el recurso seleccionado.

### CI verde pero despliegue no se dispara

1. comprobar que el workflow se llama `CI`;
2. revisar que el run verde pertenezca a `main`;
3. ejecutar manualmente el workflow de despliegue;
4. comprobar que Actions esté habilitado en el repositorio.

### El sitio publicado no coincide con el último commit

Comparar el SHA mostrado en Cloudflare con el SHA del run de CI. No validar solo por fecha o por el texto visible.

## Estado actual

- Proyecto y workflow: preparados.
- Lockfile reproducible: publicado.
- Despliegue público: pendiente de credenciales y verificación.
- URL pública confirmada: todavía no registrada.

## Fuentes oficiales

- Cloudflare Pages Direct Upload con CI: <https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/>
- Cloudflare Pages Git integration: <https://developers.cloudflare.com/pages/configuration/git-integration/>
- Astro y Cloudflare: <https://docs.astro.build/en/guides/integrations-guide/cloudflare/>
- Wrangler Pages deploy: <https://developers.cloudflare.com/workers/wrangler/commands/#pages-deploy>
