# Despliegue en Cloudflare Pages

Fecha de actualización: **2026-07-21**.

## Arquitectura

```text
push a main
  → CI verifica el snapshot versionado
  → build copia reference-snapshot/site a dist
  → Deploy Cloudflare Pages usa el mismo SHA
  → wrangler pages deploy dist
  → verificación HTTP
```

Cloudflare recibe exclusivamente `dist/`. No ejecuta WordPress, PHP, MariaDB ni Node.js en producción.

## Destino

```text
Proyecto Pages: shekinah
Rama:          main
Dominio:       https://shekinah-7dl.pages.dev
```

## Secretos requeridos

En **GitHub → Settings → Secrets and variables → Actions**:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

El token debe limitarse a la cuenta correcta y al permiso **Cloudflare Pages: Edit**. No usar la Global API Key ni guardar valores en archivos.

## Evitar doble despliegue

GitHub Actions es el único publicador seleccionado. En Cloudflare:

1. abrir **Workers & Pages**;
2. abrir el proyecto Pages `shekinah`;
3. revisar **Settings → Builds & deployments**;
4. desactivar producción y previews automáticos de la integración Git nativa, o desconectarla;
5. conservar el proyecto y el dominio;
6. eliminar o desconectar cualquier Worker que ejecute `wrangler deploy` solo después de confirmar que no contiene otro servicio.

No debe coexistir la integración Git automática con el workflow de Wrangler.

## Comando correcto

```bash
npm exec -- wrangler pages deploy dist \
  --project-name shekinah \
  --branch main \
  --commit-hash <SHA_VALIDADO>
```

`wrangler deploy` sin `pages` corresponde a Workers y no es válido para este sitio.

## Límites controlados

El build y las auditorías bloquean:

- archivos mayores de 25 MiB;
- más de 20.000 archivos para el plan Free;
- más de 2.100 reglas en `_redirects`;
- SQL, PHP, backups, logs y sourcemaps;
- referencias a localhost o al dominio Hostinger anterior;
- recursos internos rotos.

## Primera publicación

1. generar y publicar el snapshot con `scripts/Run-FullMigration.ps1 -Publish`;
2. comprobar CI verde para el commit publicado;
3. crear los dos secretos;
4. desactivar el publicador nativo duplicado;
5. ejecutar o esperar **Deploy Cloudflare Pages**;
6. confirmar que el workflow usa el mismo SHA;
7. abrir el dominio estable y las rutas críticas;
8. verificar robots, sitemap, imágenes, consola y redirecciones.

## Verificación manual

```powershell
$Base = 'https://shekinah-7dl.pages.dev'
$Routes = @(
    '/', '/inicio/', '/nosotros/', '/tienda/', '/blog/', '/recetas/',
    '/chocolate-casero/', '/receta-barra-de-cereal/',
    '/terms-and-conditions/', '/robots.txt'
)
foreach ($Route in $Routes) {
    $Response = Invoke-WebRequest -Uri ($Base.TrimEnd('/') + $Route) -MaximumRedirection 10 -TimeoutSec 30
    [pscustomobject]@{ Route = $Route; Status = $Response.StatusCode; Bytes = $Response.RawContentLength }
}
```

También debe responder uno de:

```text
/sitemap.xml
/sitemap-index.xml
/wp-sitemap.xml
```

## Cierre

La publicación no se considera terminada por el solo hecho de que Wrangler devuelva una URL. Deben coincidir commit de `main`, CI, deployment de Cloudflare y contenido público.
