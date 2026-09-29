# Pago antes de coordinación — 2026-09-29

## Alcance

Solicitud del titular: el recorrido normal debe validar stock y total, abrir
Mercado Pago y ofrecer coordinación después de acreditar el pago. No introducir
aceptación administrativa ni usar WhatsApp como sustituto del checkout.

Base inspeccionada: `ac67c80e913b52d3d4511d6f66b46803d2a3d024`.

## Cambio acotado

- `WebOrderRequestSection` omite la consulta redundante cuando una compra ya es
  pagable, sin error de checkout. Recuperar un pedido no redirige sin un gesto.
- El enlace de WhatsApp de esa sección aparece sólo después de un pago aprobado
  sin revisión pendiente. No incluye tokens, secretos ni datos del comprador.
- Se retira la promesa de aviso posterior para un checkout no disponible. La
  recuperación y la indisponibilidad real siguen visibles.
- Se ajusta la expectativa anterior de WhatsApp previo al pago y se agregan
  ocho casos de regresión usando los dobles existentes de la suite.

La preparación Dux, la reserva, los límites, la idempotencia, las condiciones
server-side de pago, los contratos, D1, flags y preferencias permanecen intactos.
No se modifican el checkout legacy ni la excepción de cotización de envío.

## Validación en el entorno de edición

- Copias fuente de componente y prueba verificadas contra sus blob SHA de Git.
- Sintaxis TSX: verificada con TypeScript 5.8.3 disponible en el entorno.
- Catorce controles aislados de renderizado/acciones: aprobados. El arnés usa
  dobles de hooks y JSX; no ejecuta efectos de React ni sustituye Vitest/E2E.
- Comparación exacta del código de preparación, recuperación e inicio de pago:
  sin cambios, al igual que las reglas de seguimiento e identidad terminal.
- `git diff --no-index --check` sobre las copias fuente y modificadas: aprobado.
- Suite completa local, lint, typecheck del proyecto, build y Playwright:
  no disponibles; el entorno carece de las dependencias y versiones requeridas,
  y GitHub/npm no resuelven por DNS desde la terminal.

La publicación debe usar objetos Git y avance fast-forward de `main` mediante
el conector autorizado, sin ramas, PRs, force-push ni cambios al árbol ajeno.
El estado de CI y despliegue se acredita por separado después del commit; este
archivo no afirma que esos controles ya hayan terminado.

## Operación pendiente

El navegador remoto no dispone de sesión administrativa ni credenciales
habilitadas para leer `commerce-readiness`. No se modificó configuración externa
ni se crearon pedidos, reservas, preferencias o pagos.

El mensaje anterior correspondía a reserva confirmada con
`checkoutAvailable=false`. El bloqueo puede depender de configuración de pago,
guards, evidencia financiera o ventana/coherencia de una preferencia. Esta
corrección de interfaz NO fuerza ese valor ni acredita la reapertura del cobro.
Debe comprobarse el readiness autenticado y el estado de la compra afectada.
No renovar una preferencia vencida, cerrar una reserva histórica o borrar una
identidad mediante SQL para hacer reaparecer el botón.
