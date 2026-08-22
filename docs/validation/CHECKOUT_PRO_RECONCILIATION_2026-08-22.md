# Verificación de Checkout Pro y conciliación autoritativa — 2026-08-22

## Alcance y punto de partida

La intervención comenzó sobre `main` y `origin/main` limpios, sin cambios locales heredados, en el SHA:

```text
5fd9d31ae37734baeaca02f244bc75b1e76b5601
```

Se reconstruyeron los contratos de Checkout Pro, Webhooks, D1, stock, WhatsApp, administración y despliegue antes de editar. No se modificaron migraciones aplicadas ni recursos productivos durante la implementación.

## Brechas cerradas en código

- El pago consultado a Mercado Pago ahora conserva `live_mode`, `collector_id` y `metadata.order_id`.
- El webhook firmado exige `live_mode` y `user_id`, y sólo procesa un pago cuando notificación, modo configurado, cuenta cobradora, metadata, referencia, importe y moneda coinciden.
- Los desajustes de entorno, cuenta o metadata se registran como eventos ignorados y no mutan pedido, pago ni stock.
- El backoffice incorpora una conciliación protegida y auditada para pedidos Checkout Pro. Busca por `external_reference`, obtiene cada pago por ID y reutiliza la transición idempotente del webhook; no permite elegir un estado manualmente.
- El detalle administrativo muestra preferencia, reserva, vencimiento, consumo, control numérico por item y la política de que un reintegro financiero no repone stock automáticamente.

No se agregó ninguna migración: la persistencia y los triggers de `0001` a `0008` ya cubren pagos, idempotencia, reservas y consumo.

## Evidencia automatizada local

Entorno: Node.js `24.18.0`, npm `11.16.0`.

Comandos finales ejecutados después de los cambios:

```text
npm ci                                      PASS
npm run install:browsers                    PASS
npm run verify                              PASS
npm run build:pages                         PASS
git diff --check                            PASS
```

`npm run verify` completó:

- ESLint y TypeScript estricto;
- 47 archivos y 258 pruebas Vitest;
- catálogo canónico de 510 productos y 16 categorías;
- verificaciones de catálogo comercial, pesos, activos, seguridad y automatización;
- build Vite;
- 25 pruebas Playwright.

La cobertura nueva comprueba:

- rechazo cerrado de entorno, cuenta y metadata ajenos;
- búsqueda exacta de pagos y consulta autoritativa individual;
- autenticación y mismo origen para la conciliación;
- stock controlado `2 → 1` al aprobar, sin segundo consumo al repetir;
- una sola fila de pago e historial de auditoría por cada solicitud;
- visibilidad accesible de reserva y política de reintegro en el backoffice.

El build conserva la advertencia histórica del chunk principal de 512,29 kB; no fue causada por un fallo de compilación y no se incorporó una refactorización ajena al alcance.

## Cloudflare y D1 observados antes de publicar

- Proyecto Pages: `shekinah`; producción conectada a `main`.
- Deployment productivo observado: `388d11f0-c74e-4b32-b9f9-e68d983326e2`, fuente `5fd9d31`, HTTP 200.
- Producción: `COMMERCE_ENABLED=false`, `VITE_COMMERCE_ENABLED=false`, modo `production`, origen `https://shekinah.ar`.
- Preview: `COMMERCE_ENABLED=true`, `VITE_COMMERCE_ENABLED=false`, modo `sandbox`, origen `https://mp-sandbox.shekinah-7dl.pages.dev`.
- D1 production `shekinah-commerce` y preview `shekinah-commerce-preview` conservan `0001` a `0008` sin migraciones pendientes.
- Los nombres de `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` y `ORDER_TOKEN_SECRET` están presentes como secretos cifrados en producción. La presencia no prueba vigencia ni identidad y no se leyeron valores.
- El endpoint productivo de preferencias continuó respondiendo `503 COMMERCE_DISABLED`; un webhook con firma inválida respondió `401 WEBHOOK_SIGNATURE_INVALID` en ambos entornos.

La D1 productiva observada tenía 15 pedidos: 4 Checkout Pro, 11 WhatsApp, 8 aprobados, 4 pendientes, cero pagos y cero eventos de pago. No se creó un pago ni se modificó stock comercial en producción.

El catálogo efectivo productivo devolvía 513 productos por mutaciones administrativas históricas: 6 con stock numérico y 507 sin cantidad numérica. El catálogo versionado permanece en 510/16; no se inventaron cantidades para productos legacy.

## Publicación del código

El commit funcional es:

```text
0f93d620faad6e93f76a364e9dc6794ac5c5f119  feat: reconcile Mercado Pago payments
```

- Push: `main → origin/main`, sin force-push.
- GitHub Actions: run `32605619627`, job `97110114994`, conclusión `success` en 2 min 10 s.
- Cloudflare Pages production: deployment `53f7208f-3fa4-4127-9106-90c1f8632c62`, fuente `0f93d62`, estado activo.
- Smoke: `https://shekinah.ar` y `https://53f7208f.shekinah-7dl.pages.dev` respondieron 200; preferencias devolvió 503 `COMMERCE_DISABLED`; firma inválida devolvió 401 `WEBHOOK_SIGNATURE_INVALID`; conciliación sin identidad devolvió 401 `ACCESS_TOKEN_MISSING`.

El código quedó publicado sin habilitar Checkout Pro ni realizar operaciones financieras reales.

## Sandbox real

Contra `https://mp-sandbox.shekinah-7dl.pages.dev` se creó una preferencia real de prueba para una unidad de `abedul`, ARS 1.500, usando datos de fulfillment inequívocamente sintéticos:

- primer POST: `201`;
- repetición con la misma UUID y carrito: `200`;
- misma URL de checkout y mismo token público en ambas respuestas;
- host devuelto: `sandbox.mercadopago.com.ar`;
- el checkout hospedado mostró modo Sandbox y el item `Abedul x 50 gr`;
- D1 preview persistió un pedido `pending`, total `150000` en unidades menores y una preferencia; el producto legacy no tenía stock numérico, por lo que no generó reserva controlada.

Al pulsar **Pagar**, Mercado Pago exigió una reautenticación humana mediante QR o código enviado al teléfono terminado en `2230`. No se solicitó, leyó ni registró ese código. Por lo tanto, esta etapa demuestra credencial sandbox válida, creación de preferencia, redirección e idempotencia, pero no demuestra todavía pago aprobado, webhook firmado ni consumo de stock remoto.

## Mercado Pago observado

La sesión autenticada mostró la aplicación `Shekinah Moreno Checkout`, número `8813922763383669`, con calidad indicada por el proveedor como «Debajo de lo ideal». El acceso a sus datos sensibles y configuración detallada quedó detenido por la misma reautenticación QR.

Hasta completar esa acción humana no se afirma:

- que la aplicación pertenezca a la cuenta vendedora pretendida;
- que Client ID, access token y secret de producción sean los definitivos o estén vigentes;
- que la URL y el tópico de Webhooks sigan configurados correctamente en el panel actual;
- que exista una cuenta compradora de prueba distinta del vendedor;
- que el pago sandbox, el webhook firmado o la medición de calidad estén aprobados.

## Intentos diagnósticos fallidos preservados

- Una consulta inicial de migraciones usando el nombre de la base preview no resolvió el recurso desde la configuración y terminó en una aserción del runtime de Wrangler. Se corrigió usando el binding `DB --preview`; la lectura posterior pasó.
- Un agregado D1 de quince términos con `UNION` excedió el límite de la consulta remota. Se reemplazó por subconsultas escalares de sólo lectura y pasó.
- La primera consulta del pedido sandbox usó la columna inexistente `order_items.id` y D1 devolvió `no such column: oi.id`. Se corrigió a `COUNT(order_items.product_id)`; la lectura pasó sin escrituras.
- El primer smoke de páginas usó por error la variable PowerShell reservada `$home`; PowerShell impidió sobrescribirla. Se repitió con `$pageResponse` y ambos destinos respondieron 200.

### Incidente de configuración preview y recuperación

El primer upload directo de `0f93d62` se ejecutó con un `wrangler.jsonc` que sólo declaraba D1 y no reproducía las variables ni R2 de ambos entornos. Pages tomó el archivo como fuente de verdad: el deployment preview `8c85c609-ba59-4e27-9b91-a8a80fec4788` quedó con comercio deshabilitado y sin modo de pago. Además se adjuntó `commit-dirty=false` pese a existir cambios documentales locales; ese deployment intermedio no se usa como evidencia definitiva.

Una primera restauración repuso las variables y R2, pero mantuvo el ID productivo como `database_id` de nivel superior confiando incorrectamente en `preview_database_id`. Pages ignoró este último para el binding del deployment y una repetición sintética escribió un pedido sandbox en D1 production. El pedido quedó delimitado inequívocamente:

```text
order: ord_ciggGBYHCkj5MDisHkFCaJ7Y
status: pending
total_minor: 150000
items: 1
payments: 0
full_name: Prueba Sandbox Shekinah
```

Se verificó el objetivo antes de borrar. Luego se eliminó exactamente esa orden, su item y fulfillment por cascade, y su `checkout_intents`; no había pagos. La comprobación posterior devolvió 15 pedidos productivos, cero órdenes sintéticas con esa marca, cero intenciones y cero pagos asociados. D1 Time Travel conserva la posibilidad de recuperación dentro de su ventana, aunque no fue necesaria.

La configuración se corrigió con preview completo en el nivel superior —D1 `48d8ae41-8910-4f8e-b537-3706c07e2cbf`, R2 `shekinah-preview`, modo sandbox— y production completo en `env.production` —D1 `533c7c65-1dbb-4f15-be96-c6088700a8e1`, R2 `shekinah`, comercio cerrado—. El deployment preview corregido es `60537c2d`; el replay volvió a 200 con la URL y token originales y una firma inválida volvió a 401, demostrando binding preview y secretos sandbox disponibles. La configuración descargada posteriormente confirmó ambos D1, ambos R2 y todos los flags no secretos en sus entornos correctos.

`wrangler.example.jsonc` y el runbook se ajustaron para que futuros uploads directos declaren los dos entornos completos y no interpreten `preview_database_id` como sustituto del `database_id` preview de Pages.

Los fallos de consulta y del smoke PowerShell fueron diagnósticos, no fallos del producto ni de las migraciones, y no modificaron D1. El incidente de binding sí creó datos sintéticos en producción; por eso se documentó por separado, se revirtió con objetivos exactos y se verificó el conteo restaurado.

## Estado de activación en este punto

El código y la validación local están completos. Checkout Pro productivo continúa cerrado y el fallback manual autorizado permanece intacto. La activación productiva y cualquier pago real siguen condicionados a completar la reautenticación humana, validar la cuenta/aplicación, cerrar el sandbox con webhook firmado y obtener confirmación explícita antes de una operación financiera real.
