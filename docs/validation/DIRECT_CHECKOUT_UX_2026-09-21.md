# Experiencia pública de compra directa — 2026-09-21

## Alcance y base

Corrección de presentación pública y continuación automática solicitada por el
titular. Base local y remota verificada mediante status, switch, fetch y pull
fast-forward: `f2c20ef394e4201bf7a452f163e1ea95f5ba9fbb`, rama `main`, en
`C:\laburo\shekinah-release-20260910-155842`.

La modificación preexistente de `COMMERCE_D1_ROLLOUT_2026-09-13.md` se excluye de
esta entrega. Su SHA-256 antes de editar es
`D124416017F13CA8A190B2310375B7F67F96F47B993F8D210068981B84F48D94`.
No se restaura, prepara, stashea ni modifica.

## Comportamiento

- Retiro: «Continuar al pago» → preparación accesible → Checkout Pro automático
  cuando el recibo confirma disponibilidad y total. Una marca por token y la
  exclusión síncrona del componente impiden dobles llamadas automáticas.
- La recuperación inicial termina antes de habilitar un alta. Volver a una
  compra guardada nunca autoriza por sí solo una redirección; ofrece una acción
  explícita. Una respuesta perdida del intento recién iniciado conserva su
  identidad y puede continuar tras recuperarla.
- La apertura fallida permite «Ir a Mercado Pago» con la misma compra. Una URL
  válida ya recibida queda como enlace de respaldo sin crear otra preferencia.
- Se ocultan referencias WEB, tokens, enlaces protegidos, estados Dux y detalles
  de polling. Las APIs, IndexedDB, referencias y diagnósticos internos permanecen.
- El retorno aprobado muestra «¡Compra confirmada!», «Tu pedido es SHK-XXXXXXXX.»
  y «Pronto nos pondremos en contacto para coordinar la entrega.».
- El enlace opcional «Enviar mensaje por WhatsApp» usa el mecanismo autorizado,
  incluye el número comercial, abre una pestaña con `noopener noreferrer` y
  conserva `whatsapp_open`, sin enviar automáticamente un mensaje.
- El único cambio server-side es proyectar `orderNumber` con el contrato
  `formatOrderNumber`, usando `orders.id` en la lectura pública existente. No
  devuelve el ID completo ni el token. No cambia la autoridad financiera.
- Pendientes, rechazos, cancelaciones, reintegros e incidencias permanecen
  diferenciados. Se conserva la limpieza condicionada al pago autoritativo y
  al mismo carrito/intento recordado, incluida su compatibilidad anterior.
- Correo conserva cotización previa; no se cambian logística, precios, stock,
  preparación Dux, idempotencia, webhook, guards, migraciones, scheduler, flags
  productivos ni checkout legacy. No se agregan dependencias.

## Validación local

- `npm ci`: verificado con Node `24.18.0`, npm `11.16.0`. El lockfile no cambia.
  Auditoría: 4 avisos existentes (2 moderados, 2 altos); no se ejecuta audit fix.
- `npm run install:browsers`: verificado.
- Primera prueba dirigida: 70 aprobadas, 1 fallida por esperar sólo el encabezado
  del resumen antes de la actualización asíncrona del total. Se corrigió la
  espera al dato confirmado. Un chequeo de tipos durante la edición detectó
  además un import de StrictMode todavía sin uso, resuelto al agregar su prueba.
- Segunda prueba dirigida: 7 archivos y 85 pruebas aprobados.
- Primer `npm run verify`: fallido en lint por 4 detalles del código de pruebas
  y del helper de mensajes (dos async sin await, un parámetro sin uso y acceso
  a un valor any). Se corrigieron sin modificar contratos comerciales.
- Segundo `npm run verify`: lint, tipos, 802 pruebas unitarias/integración y
  verificadores aprobados; 29 E2E aprobados y 1 fallido por una expectativa del
  texto anterior cuando las altas están cerradas. Se actualizó esa expectativa
  al mensaje público nuevo. El E2E de compra directa ya aprobaba en ese intento.
  Las 14 pruebas omitidas pertenecen a reservas locales históricas de WhatsApp,
  deshabilitadas previamente y ajenas al flujo productivo.
- Tercer `npm run verify`: **verificado**, exit 0. 120 archivos, 802 pruebas
  unitarias/integración aprobadas, las 14 omisiones históricas y 30 E2E aprobados.
  Incluye lint, TypeScript, catálogo, pesos, build, assets, seguridad y automatización.
- Suites dirigidas adicionales de compra directa/asistida, checkout público,
  estado público/financiero y sesiones: **verificado**, 9 archivos y 72 pruebas
  aprobados. Se suman a las 85 pruebas dirigidas de componentes/contratos.
- Avisos no bloqueantes de la validación: prioridad de `FORCE_COLOR` frente a
  `NO_COLOR` y tiempo del plugin `vite:prepare-out-dir`; exit final 0.
- `npm run build:pages`: **verificado**, exit 0; repite los 120 archivos,
  802 pruebas aprobadas y 14 omisiones históricas. Build y verificadores completos
  aprobados. Los artefactos de `dist` quedan fuera de Git.
- `git diff --check`: **verificado**; enlaces relativos de los documentos:
  **verificado**. Diff completo de los cambios propios, rutas, ausencia de
  binarios/secretos/datos personales nuevos y lockfile intacto: **revisado por código**.
  El control del índice y el hash de la modificación ajena se repiten antes del commit.

## Evidencia externa

El SHA de commit/push, jobs CI, artefacto y deployment Pages deben cotejarse
después de publicar y registrarse en el informe de cierre del mismo SHA.
El push por sí solo no acredita producción.

La inspección previa del navegador encontró la sesión administrativa de Shekinah
cerrada y la compra guardada del smoke anterior ya liberada. Se conserva esa
identidad del navegador. Una consulta HTTPS desde PowerShell no estuvo
disponible por `PartialChain` en la cadena de confianza local; el navegador
abrió el dominio normalmente, sin omitir advertencias ni desactivar TLS.
No se crea una reserva productiva sin poder completar su cierre por el
circuito soportado. El recorrido hasta la redirección y los pagos aprobados se
prueban con respuestas controladas en el navegador local; no se fabrica una
aprobación en producción ni se realiza un cobro. El smoke público posterior al
despliegue y su alcance se acreditan por separado en el cierre.
