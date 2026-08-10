# Incidentes y rollback

## Prioridades

1. Evitar nuevos cobros incorrectos.
2. No perder notificaciones de pagos de Checkout Pro ya iniciados.
3. Preservar evidencia en D1, Mercado Pago, Cloudflare y Git.
4. No exponer secretos ni datos administrativos.
5. Restaurar servicio mediante cambios reversibles y versionados.

## Corte seguro de nuevas ventas

### Checkout Pro integrado

Ante importes incorrectos, catálogo inconsistente o comportamiento anómalo:

```text
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
```

Esto bloquea nuevas preferencias y conserva activo el webhook para pagos ya iniciados. No borrar la base, no deshabilitar D1 y no retirar las credenciales del webhook salvo que estén comprometidas.

### Fallback manual de Link de Pago

`COMMERCE_ENABLED=false` no bloquea el Link de Pago manual autorizado. Si también deben detenerse nuevos cobros manuales, deshabilitar explícitamente el enlace público en el build:

```text
VITE_MERCADO_PAGO_PAYMENT_LINK=
```

y desplegar ese cambio. Si también debe cerrarse el canal de carrito por WhatsApp:

```text
VITE_WHATSAPP_NUMBER=
```

Los valores vacíos anulan los defaults públicos autorizados. Verificar después del deployment que el carrito muestre el pago deshabilitado y, si corresponde, WhatsApp deshabilitado. Si no es posible cambiar la configuración de build con seguridad, publicar un commit de reversión/corte; no hacer force-push.

Un pago efectuado antes del corte manual debe verificarse directamente en la cuenta de Mercado Pago y resolverse por el procedimiento operativo; no existe pedido D1 ni webhook asociado al Link de Pago del panel.

## Firma o credencial de Mercado Pago comprometida

- desactivar nuevas ventas integradas;
- rotar la credencial en el proveedor;
- actualizar el secreto cifrado de Pages;
- revisar `payment_events`, pagos y pedidos desde la primera fecha posible de exposición;
- no aprobar manualmente pedidos basándose sólo en retornos o mensajes del comprador;
- validar cada pago afectado contra la API del proveedor;
- documentar IDs, SHA, ventanas temporales y acciones.

La rotación de credenciales de la aplicación de Checkout Pro no sustituye el corte del Link de Pago manual: son flujos distintos.

## D1 no disponible

El Checkout Pro integrado debe responder `503 DATABASE_UNAVAILABLE`; no debe redirigir a Mercado Pago. Los webhooks responderán error y el proveedor podrá reintentarlos.

- no crear una base vacía con el mismo binding para “resolver” el incidente;
- verificar binding, entorno preview/production y estado de migraciones;
- restaurar desde backup sólo con autorización y evidencia;
- al recuperar servicio, revisar eventos `failed` y estados pendientes.

El fallback manual no depende de D1; decidir explícitamente si debe permanecer disponible durante el incidente.

## Stock inconsistente

Ante stock negativo, decimal, superior a 1.000.000 o una compra que exceda la existencia:

- mantener el rechazo server-side y no editar D1 manualmente para saltearlo;
- retirar temporalmente el producto mediante disponibilidad manual si la existencia real es incierta;
- comprobar el payload efectivo en `catalog_product_mutations` y la auditoría;
- recordar que el sistema no reserva ni descuenta por venta: reconciliar las unidades con la operación real antes de volver a habilitar el producto;
- no asignar cantidades ficticias a los productos legacy sin control de stock.

## R2 o imágenes administrativas no disponibles

Si falta `CATALOG_IMAGES`, R2 responde `10042`, falla el upload o falla D1 después de cargar:

- conservar la referencia e imagen anterior; una preview local no acredita guardado;
- si se creó un objeto nuevo y D1 no persistió, intentar eliminar sólo ese objeto;
- no eliminar assets legacy ni objetos desconocidos;
- no reemplazar R2 con base64 en D1, Git o almacenamiento del navegador;
- verificar proyecto Pages, entorno y binding sin tocar el Worker homónimo;
- mantener la gestión textual/stock disponible y comunicar que el upload está temporalmente bloqueado.

Si se habilita accidentalmente el dominio público `r2.dev`, deshabilitarlo y verificar nuevamente `publicR2DevEnabled=false` en ambos buckets. La lectura comercial autorizada pasa sólo por `/api/catalog-images/*` en Pages; no exponer el bucket directamente como atajo operativo.

Para rollback de una referencia ya persistida, restaurar mediante una nueva mutación administrativa auditada. Eliminar el objeto nuevo únicamente después de confirmar que ninguna mutación efectiva lo referencia.

## Autenticación administrativa no disponible o mal configurada

La administración debe permanecer cerrada. `/admin` puede seguir sirviendo el formulario, pero ninguna API protegida debe aceptar operaciones sin identidad. No eliminar el middleware, la firma de cookie, el control de origen ni el rate limiting para recuperar acceso.

- confirmar sólo los nombres y tipos cifrados de los cuatro secretos `ADMIN_*`, nunca sus valores;
- verificar binding `DB` y migración `0005_admin_auth.sql`;
- si la contraseña se perdió o comprometió, generar un hash nuevo fuera del repositorio y actualizarlo en Pages;
- rotar `ADMIN_SESSION_SECRET` para cierre global de sesiones cuando exista riesgo de cookie comprometida;
- revisar los resultados HTTP de `admin_audit` y los contadores opacos sin intentar reconstruir IP o usuario;
- si se usa el fallback de Cloudflare Access, confirmar Team Domain, AUD, expiración, issuer y claves públicas sin convertirlo en un gate externo que bloquee `/api/admin/auth/login`.

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

Las migraciones son aditivas. Un rollback de aplicación puede dejar las tablas sin uso sin dañarlas; ésa es la opción conservadora.

No hacer `DROP TABLE` como parte de un rollback inmediato. Para revertir esquema o datos:

- detener nuevas ventas integradas;
- decidir por separado si se mantiene o corta el fallback manual;
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
- estado del fallback manual;
- alcance de pedidos/pagos/eventos;
- pruebas ejecutadas;
- acciones externas en Cloudflare y Mercado Pago;
- responsables y aprobaciones;
- medidas preventivas pendientes.
