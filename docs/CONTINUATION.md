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
2. `docs/CURRENT_STATE.md`;
3. `docs/ARCHITECTURE.md`;
4. `docs/FULL_STACK_COMMERCE.md`;
5. `docs/COMMERCE_OPERATIONS.md`;
6. `docs/COMMERCE_DEPLOYMENT.md`;
7. `docs/COMMERCE_INCIDENTS_AND_ROLLBACK.md`.

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

## Próximos pasos

1. validar localmente la integración;
2. revisar el diff;
3. crear commit atómico;
4. hacer push a `origin/main`;
5. verificar GitHub Actions para el SHA exacto;
6. verificar el deployment de Cloudflare Pages;
7. configurar infraestructura y secretos;
8. aplicar migraciones D1;
9. validar Mercado Pago y webhook;
10. configurar Access;
11. activar únicamente capacidades autorizadas;
12. ejecutar pruebas de humo.

## Prohibiciones

- no inventar secretos, IDs, dominios, números ni políticas de retención;
- no guardar credenciales en Git;
- no activar producción sin comprobaciones;
- no confundir build aprobado con deployment aprobado;
- no confundir deployment con configuración productiva completa.