# Estado de Cloudflare Pages

<!-- SHEKINAH-VERIFICATION:START -->

## Verificación más reciente de Shekinah

Fecha UTC: **2026-07-22T18:23:41Z**.

- Nombre público del sitio: **Shekinah**.
- Identificador técnico del proyecto Pages: `shekinah`.
- Dominio estable: **https://shekinah-7dl.pages.dev**.
- Rama de producción: `main`.
- Directorio publicado: `dist`.
- Publicador: GitHub Actions mediante `wrangler pages deploy`.
- Commit de contenido verificado: `7a18900c1979dabb080c14d08091421b5d8a0206`.
- Deployment run: `29946314352`.
- Estado: **success**.

El identificador técnico permanece en minúsculas porque forma parte del hostname y de la API; la marca visible del sitio es **Shekinah**.
<!-- SHEKINAH-VERIFICATION:END -->

Fecha de actualización: **2026-07-22**.

## Evidencia conocida

- Proyecto esperado: `shekinah`.
- Dominio estable asignado: `https://shekinah-7dl.pages.dev`.
- Rama: `main`.
- No existe evidencia desde este repositorio de que la integración Git nativa haya sido desactivada.
- El snapshot `91761a6fdb64da05b54331524d11577ae3670032` fue publicado en `main` y su CI terminó verde.
- El deploy [29925142658](https://github.com/JerePrograma/shekinah/actions/runs/29925142658) falló en `Require Cloudflare credentials` antes de ejecutar Wrangler.
- GitHub no lista `CLOUDFLARE_API_TOKEN` ni `CLOUDFLARE_ACCOUNT_ID` como secretos del repositorio ni del environment `cloudflare-pages-production`.
- No se encontraron esas variables en el entorno local ni una configuración local de Wrangler; no se realizó una publicación paralela.
- El dominio estable responde, pero sigue mostrando la versión previa; `/inicio/` redirige a `/`, por lo que no prueba el snapshot.

## Configuración decidida

```text
GitHub Actions = único CI/CD
Cloudflare Pages = destino estático
Directorio = dist
Comando = wrangler pages deploy dist
```

No se agregará un Worker ficticio ni un entry point para satisfacer `wrangler deploy`.

## Acciones manuales en el panel

1. abrir **Workers & Pages**;
2. localizar el recurso asociado a `shekinah-7dl.pages.dev`;
3. confirmar que es Pages y que su nombre API es `shekinah`;
4. desactivar o desconectar la integración Git automática;
5. revisar que no exista otro Worker publicando el mismo repositorio;
6. crear un token limitado a la cuenta con **Cloudflare Pages: Edit**;
7. cargar token y Account ID como secretos de GitHub;
8. ejecutar CI y deployment;
9. verificar el mismo SHA en GitHub y Cloudflare.

## Estado que no puede afirmarse desde GitHub

El repositorio no puede cambiar por sí solo la configuración del panel de Cloudflare. Hasta que el usuario complete esos pasos, deben permanecer como pendientes documentados.
