# Incidentes y rollback

## Prioridades

1. Evitar nuevos cobros incorrectos.
2. No perder notificaciones de pagos ya iniciados.
3. Preservar evidencia en D1, Mercado Pago, Cloudflare y Git.
4. No exponer secretos ni datos administrativos.
5. Restaurar servicio mediante cambios reversibles y versionados.

## Corte seguro de nuevas ventas

Ante importes incorrectos, catálogo inconsistente o comportamiento anómalo:

```text
COMMERCE_ENABLED=false
```

Esto bloquea nuevas preferencias y conserva activo el webhook para pagos ya iniciados. No borrar la base, no deshabilitar D1 y no retirar las credenciales del webhook salvo que estén comprometidas.

## Firma o credencial de Mercado Pago comprometida

- desactivar nuevas ventas;
- rotar la credencial en el proveedor;
- actualizar el secreto cifrado de Pages;
- revisar `payment_events`, pagos y pedidos desde la primera fecha posible de exposición;
- no aprobar manualmente pedidos basándose sólo en retornos o mensajes del comprador;
- validar cada pago afectado contra la API del proveedor;
- documentar IDs, SHA, ventanas temporales y acciones.

## D1 no disponible

El checkout debe responder `503 DATABASE_UNAVAILABLE`; no debe redirigir a Mercado Pago. Los webhooks responderán error y el proveedor podrá reintentarlos.

- no crear una base vacía con el mismo binding para “resolver” el incidente;
- verificar binding, entorno preview/production y estado de migraciones;
- restaurar desde backup sólo con autorización y evidencia;
- al recuperar servicio, revisar eventos `failed` y estados pendientes.

## Access no disponible o mal configurado

La administración debe permanecer cerrada. No eliminar la validación JWT ni publicar endpoints temporales sin autenticación.

- confirmar Team Domain y AUD;
- comprobar que `/admin*` y `/api/admin/*` están cubiertos por Access;
- revisar expiración, issuer y claves públicas;
- recuperar acceso corrigiendo la configuración, no relajando controles.

## Analítica enviada sin consentimiento

- establecer `ANALYTICS_ENABLED=false`;
- identificar la ventana y sesiones afectadas;
- preservar evidencia mínima;
- ejecutar el procedimiento de eliminación aprobado;
- corregir y probar antes de reactivar;
- actualizar el registro del incidente y la evaluación de privacidad.

## Rollback de código

No usar `git reset --hard`, reescritura de historial, force-push ni borrado manual del commit publicado.

Sobre `main` sincronizado:

```powershell
git status
git switch main
git fetch origin
git pull --ff-only origin main
git revert <SHA_DEL_COMMIT_FULLSTACK>
npm ci --no-audit --no-fund
npm run install:browsers
npm run verify
git push origin main
```

Verificar GitHub Actions sobre el nuevo SHA de revert y el deployment correspondiente.

## Rollback de base

La migración inicial es aditiva. Un rollback de aplicación puede dejar las tablas sin uso sin dañarlas; ésa es la opción conservadora.

No hacer `DROP TABLE` como parte de un rollback inmediato. Para revertir esquema o datos:

- detener nuevas ventas;
- exportar/respaldar D1;
- definir SQL de reversión revisado;
- probarlo sobre una copia local;
- aprobar la pérdida o transformación de datos;
- ejecutar en una ventana controlada;
- validar conteos, relaciones y pagos después.

## Cierre del incidente

Registrar:

- inicio y fin con zona horaria;
- SHA desplegado antes y después;
- flags y bindings afectados;
- alcance de pedidos/pagos/eventos;
- pruebas ejecutadas;
- acciones externas en Cloudflare y Mercado Pago;
- responsables y aprobaciones;
- medidas preventivas pendientes.
