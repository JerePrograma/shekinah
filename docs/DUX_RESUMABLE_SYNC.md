# Sincronización Dux recuperable — 2026-10-21

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

## Límites y preservación

- Siete minutos por operación, 80 solicitudes por cliente, 45 intentos oficiales
  como techo; cada paso realiza un solo intento oficial. Los errores terminales
  del proveedor no inician automáticamente otro ciclo. Sólo la pérdida de
  transporte hacia Shekinah admite recuperación acotada del mismo UUID.
- Gate Dux compartido, páginas de 50, total estable y máximo 1000 productos e
  identidades; no se amplían los límites del proveedor ni del plan.
- Cada página conserva el máximo de 1,9 MB; la operación completa limita staging
  a 8 MB antes de cargarlo en memoria. Se reservan 256 escrituras estimadas
  adicionales contra el presupuesto existente de 40.000 por día UTC; no se
  devuelven ante fallos. La publicación conserva su reserva de delta.
- El paso final revalida todas las páginas con los parsers existentes, sin red,
  publica mediante generaciones y conserva el catálogo anterior ante recolección
  incompleta. Las páginas se eliminan al terminar o fallar; se conserva la operación.
- El inicio real de recolección respalda la fecha conservadora del stock. Repetir
  una respuesta final no renueva esa fecha. La auditoría de frescura se mantiene.
- El nombre Dux actualizado participa del hash; código y URL previamente publicada
  permanecen estables. No se infieren unidad comprable, stock ni peso desde los cc.

No se modifican comercio, pedidos, reservas, pagos, secretos, flags, mantenimiento,
editorial ni los contratos Dux/Mercado Pago. No se vuelve al catálogo manual.
La frecuencia efectiva de GitHub y los rechazos intermitentes Dux se acreditan
separadamente; segmentar no garantiza una cadencia automática de cinco minutos.

## Rollout

Validar, revisar y publicar por `main`; acreditar CI y Pages del mismo SHA.
Obtener resguardos D1, aplicar 0026 primero en Preview, verificar esquema/FK/datos,
y luego Production. No reaplicar migraciones anteriores. Ejecutar una reconciliación
controlada del nuevo SHA y contrastar nombres, códigos, URLs y snapshot público.
Un error externo conserva su evidencia y no autoriza modificar Dux ni fabricar
un resultado local. Ver [registro de validación](validation/DUX_RESUMABLE_SYNC_2026-10-21.md).
