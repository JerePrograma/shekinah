# Sincronización Dux recuperable — 2026-10-21

## Recuperación y diagnóstico — 2026-10-22

La migración aditiva 0030 conserva HTTP original, endpoint de lectura, código de
motivo en lista cerrada, campos de query conocidos y huella SHA-256 del error
acotado. Nunca almacena mensajes, cuerpos, valores, headers o credenciales.
El historial de fallos anteriores permanece intacto, sin completar datos que
no fueron observados. Un fallo recuperado conserva diagnóstico aun al completar.

Timeout, transporte, 429 y 5xx admiten hasta tres intentos de la misma fase o
página, en POST separados y con una lectura oficial por paso. Se conserva el
tope global de 45 y el prepago de lecturas adicionales; cada claim cuenta incluso
si se pierde su respuesta. La espera persistida respeta Retry-After hasta el
límite de 30 segundos; un plazo mayor es terminal y no se acorta. 400, acceso,
redirecciones y esquema inválido no se repiten automáticamente. Un cambio de día
UTC cierra la operación antes de consultar o publicar con presupuesto del día anterior.

El reloj candidato es Cloudflare cada diez minutos; GitHub queda sólo manual.
El relay se despliega separado de Pages, conserva UUID en recuperación de transporte
y limita 50 solicitudes totales. La transición cierra GitHub antes de activar
Cloudflare. La aceptación exige cuatro ciclos automáticos consecutivos, intervalos,
antigüedad, versión y presupuesto reales. Consultar
[diagnóstico y rollout](validation/DUX_RECOVERY_2026-10-22.md); este contrato
actualiza el cierre terminal de todo fallo GET y la cadencia histórica descritos abajo.

## Incidencia y alcance

La compilación CI estaba aprobada en `1fdd855`; el workflow de reconciliación
fallaba con HTTP 524. La lectura completa de 889 productos necesita 21 solicitudes
oficiales, espaciadas por el gate compartido de seis segundos: al menos 120 segundos
antes de sumar proveedor y publicación. Una única respuesta HTTP final no permite
recuperar con seguridad ese recorrido tras un corte del proxy.

El catálogo productivo observado el 21 de octubre conservaba la publicación del
9 de octubre y los nombres de aceites de coco de 200/400 cc. El usuario informó
que Dux ya tiene 180/360 cc. No se editan esos nombres manualmente en D1: deben
llegar del próximo snapshot íntegro de Dux.

## Protocolo

Los clientes web, GitHub y relay envían `POST` con JSON `{ "requestId": "UUID" }`
a sus endpoints autenticados existentes. Todos los pasos y reintentos del mismo
gesto conservan ese UUID. Una respuesta 202 indica progreso y exige otro paso;
no acredita publicación. Cada paso realiza como máximo una lectura oficial o la
publicación final. Empresa, sucursal, depósitos y páginas de 50 productos se
validan y conservan en staging D1 privado. No contienen tokens ni datos de compradores.

`0026_dux_resumable_sync.sql` agrega operaciones y páginas transitorias. Un índice
excluye otras operaciones de la empresa y un trigger protege también frente a
callers históricos. El lease de 60 segundos usa token propio; claim, avance,
fallo y cierre respetan ese token. El claim devuelve la fase actual. Una respuesta
perdida reutiliza páginas confirmadas o el resultado final guardado. Si se pierde
la respuesta después de publicar inventario, la continuación verifica el mismo
run y termina el catálogo sin otra lectura del proveedor.

El resultado final 200 incluye inventario y catálogo del mismo run, hash de 64
caracteres, lista autorizada y fecha de finalización coincidente. La administración
comprueba esa evidencia antes de anunciar éxito y recargar productos. El runner
la exige para aprobar el job. Progreso regresivo o total cambiante son errores.

Los callers sin cuerpo conservan el contrato histórico para herramientas operativas
existentes; siguen siendo una petición completa y no solucionan el límite 524.
Los tres clientes activos usan el protocolo nuevo. El relay mantiene su cron vacío.

Un inicio cuyo prepago/liberación D1 no puede confirmarse conserva el lease
inicial. Al vencer, `companies` con cero intentos y token no nulo termina
`DUX_SYNC_START_UNCERTAIN`; no empieza a leer suponiendo una reserva. Un token
nulo acredita la liberación posterior al prepago y permite continuar sin cobrar
la base dos veces. No se reembolsa un prepago acreditado con respuesta incierta.

La ampliación del encargo exige origen Dux por código/SKU exacto tanto en la tienda
como en administración. El usuario aclaró luego que un nombre editado manualmente
en Shekinah debe prevalecer por ese SKU, al igual que fotos y descripción. Una
acción explícita vuelve al nombre Dux vigente; stock y reservas siguen Dux siempre.
0027 agrega sólo ese override nullable. Sin edición se muestra el nombre Dux;
abrir el editor o guardar otro campo no crea un override. La proyección
Mercado Libre conserva fotos y descripción autorizadas y deja de sustituir el
nombre. Sus títulos históricos permanecen como evidencia, sin reescritura ni
matching por nombre. Cambiar de 200/400 a 180/360 cc no crea otro producto ni URL.

## Límites y preservación

- Siete minutos por operación, 80 solicitudes por cliente, 45 intentos oficiales
  como techo; cada paso realiza un solo intento oficial. Los errores terminales
  del proveedor no inician automáticamente otro ciclo. Sólo la pérdida de
  transporte hacia Shekinah admite recuperación acotada del mismo UUID.
- Gate Dux compartido, páginas de 50, total estable y máximo 1000 productos e
  identidades; no se amplían los límites del proveedor ni del plan.
- Cada página conserva el máximo de 1,9 MB; la operación completa limita staging
  a 8 MB antes de cargarlo en memoria. Contra el límite existente de 40.000
  escrituras estimadas por día UTC se prepagan 120 para recolección y limpieza,
  más 16 por intento de publicación; el core no vuelve a cobrar su base de 64.
  Un ciclo programado sano de hasta 1000 ítems/páginas de 50 reserva 136, incluso
  si no hay delta. Los cambios siguen reservando 14 por identidad. Se añaden 96
  en operaciones manuales para las auditorías de hasta 80 POST del cliente.
  Un ordinal de lectura repetido y los posteriores cobran cinco adicionales,
  antes de leer; cada lease de publicación recuperado vuelve a pagar 16.
  No se reembolsan reservas por fallos. Son estimaciones lógicas: los índices
  D1 conservan el margen externo del límite original y no se facturan con un
  contador SQLite local. 288 ciclos sin cambios reservan 39.168, no 92.160.
- El paso final revalida todas las páginas con los parsers existentes, sin red,
  publica mediante generaciones y conserva el catálogo anterior ante recolección
  incompleta. Las páginas se eliminan al terminar o fallar; se conserva la operación.
- El inicio real de recolección respalda la fecha conservadora del stock. Repetir
  una respuesta final no renueva esa fecha. La auditoría de frescura se mantiene.
- El nombre Dux actualizado participa del hash; código y URL previamente publicada
  permanecen estables. No se infieren unidad comprable, stock ni peso desde los cc.

No se modifican comercio, pedidos, reservas, pagos, secretos, flags, mantenimiento,
fotos/descripciones editoriales ni los contratos de inventario y pagos. El nombre
visible se ajusta al nombre Dux por SKU con prioridad manual explícita autorizada.
No se vuelve al catálogo manual.
La frecuencia efectiva de GitHub y los rechazos intermitentes Dux se acreditan
separadamente; segmentar no garantiza una cadencia automática de cinco minutos.

El verificador público sólo hace GETs canónicos, sin credenciales, de forma serial.
Reintenta como máximo tres veces la misma lectura ante transporte interrumpido,
429 o 5xx; mantiene timeout de 30 segundos, espera acotada y plazo total de 12
minutos. Un certificado inválido, JSON/tipo incorrecto o discrepancia de catálogo
falla sin ocultarse ni repetir Dux. Los diagnósticos sólo incluyen campos cerrados.
El dispatch manual `verify_only: true` omite la reconciliación y comprueba el
catálogo ya publicado; por defecto es falso y el schedule conserva su flujo.

## Rollout

Validar, revisar y publicar por `main`; acreditar CI y Pages del mismo SHA.
Obtener resguardos D1, aplicar las nuevas 0026 y 0027 primero en Preview, verificar
esquema/FK/datos y luego Production. No reaplicar migraciones ya acreditadas.
Ejecutar una reconciliación
controlada del nuevo SHA y contrastar nombres, códigos, URLs y snapshot público.
Un error externo conserva su evidencia y no autoriza modificar Dux ni fabricar
un resultado local. Ver [registro de validación](validation/DUX_RESUMABLE_SYNC_2026-10-21.md).
