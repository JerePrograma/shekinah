# Estado de Cloudflare Pages

Fecha de actualización: **2026-07-21**.

## Evidencia conocida

- Proyecto esperado: `shekinah`.
- Dominio estable asignado: `https://shekinah-7dl.pages.dev`.
- Rama: `main`.
- Un intento anterior ejecutó `wrangler deploy` y falló por falta de entry point de Worker.
- No existe evidencia desde este repositorio de que la integración Git nativa haya sido desactivada.
- El snapshot WordPress ya fue generado y validado localmente, pero todavía no existe evidencia de su deployment.
- GitHub no tiene configurados `CLOUDFLARE_API_TOKEN` ni `CLOUDFLARE_ACCOUNT_ID` al 21 de julio de 2026.
- Wrangler local no está autenticado; no se realizó una publicación paralela fuera de GitHub Actions.

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
