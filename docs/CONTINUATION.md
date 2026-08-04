# Continuación

## Fuente de verdad

Trabajar exclusivamente sobre el estado real de `main` y `origin/main`.

Antes de modificar:

```bash
git status
git switch main
git fetch origin
git pull --ff-only origin main
```

## Estado funcional esperado

El repositorio contiene una evolución full-stack basada en:

- React, TypeScript estricto y Vite;
- Cloudflare Pages Functions;
- Cloudflare D1;
- Mercado Pago Checkout Pro;
- Cloudflare Access;
- analítica first-party opcional.

Consultar primero:

1. `AGENTS.md`;
2. `docs/CODEX_AUTORREFERENCIA.md`;
3. `docs/CURRENT_STATE.md`;
4. `docs/ARCHITECTURE.md`;
5. `docs/FULL_STACK_COMMERCE.md`;
6. `docs/FULFILLMENT_AND_RETENTION.md`;
7. `docs/COMMERCE_OPERATIONS.md`;
8. `docs/COMMERCE_DEPLOYMENT.md`;
9. `docs/COMMERCE_INCIDENTS_AND_ROLLBACK.md`.

## Regla de activación

No habilitar comercio, analítica ni WhatsApp por el solo hecho de que el código compile.

La activación requiere evidencia separada de:

- D1 creado y vinculado;
- migraciones aplicadas;
- secretos cargados sin exposición;
- credenciales de Mercado Pago válidas;
- webhook con URL definitiva;
- Cloudflare Access configurado;
- número de WhatsApp autorizado;
- retención analítica autorizada;
- pruebas de humo aprobadas.

## Identidad externa verificada

- Proyecto Pages: `shekinah`.
- Dominio Pages: `shekinah-7dl.pages.dev`.
- Repositorio conectado: `JerePrograma/shekinah`.
- Rama de producción: `main`.
- Existe un Worker independiente también llamado `shekinah`; no usar sus settings para configurar Pages.

El inventario autenticado del 2026-08-04 encontró cero bases D1, cero variables/secretos/bindings en Pages y Zero Trust sin configurar. Producción y preview están en `Fail open`; los previews son públicos.

## Próximos pasos

1. cambiar producción y preview de Pages a `Fail closed`;
2. obtener el nombre exacto autorizado para D1 preview; `shekinah-commerce` ya está documentado únicamente para producción;
3. crear bases D1 separadas, migrar primero preview y comprobar el esquema;
4. vincular ambos entornos mediante el binding exacto `DB`;
5. definir Team Domain y crear la organización/aplicación de Cloudflare Access;
6. proteger `/admin*` y `/api/admin/*` y comprobar permitido/denegado;
7. configurar variables no secretas con ambos flags en `false` y cargar secretos mediante prompts protegidos;
8. validar Mercado Pago sandbox y webhook;
9. restringir previews con Access;
10. activar únicamente capacidades autorizadas y ejecutar pruebas de humo.

## Prohibiciones

- no inventar secretos, IDs, dominios, números ni políticas de retención;
- no guardar credenciales en Git;
- no activar producción sin comprobaciones;
- no confundir build aprobado con deployment aprobado;
- no confundir deployment con configuración productiva completa.
