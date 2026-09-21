# Rendimiento de la preparación de compra directa — 2026-09-21

## Alcance y base

El cliente informó lentitud después de «Continuar al pago». La base es
`1aa1130635704439597eeb4ab287a1eac33027be`, sobre `main` y `origin/main`.
Se completó el flujo de actualización Git sin divergencia. Se conserva y excluye
la modificación local ajena de `COMMERCE_D1_ROLLOUT_2026-09-13.md`.

No se modifican servidor, contratos públicos, reserva Dux, esquema ni migraciones,
precios, stock, idempotencia, webhook, autoridad financiera, flags, configuración,
dependencias ni checkout legacy. La UX publicada por la base se conserva.

## Causa y corrección

El navegador agregaba cinco segundos después de cada respuesta de preparación.
La respuesta inicial también terminaba antes de comenzar esa espera. Una pestaña
oculta o una operación ocupada podían programar otra espera de sesenta segundos,
sin escuchar la vuelta a primer plano.

Ahora se usan plazos monotónicos desde el inicio de cada petición: el tiempo de
respuesta consume los cinco segundos del intervalo. Una respuesta lenta no suma
otra pausa. Sólo hay una petición de avance en vuelo. La vuelta a una pestaña
visible respeta el plazo pendiente y continúa inmediatamente si ya venció.
Se conservan los 120 avances directos como máximo, el backoff y límite del flujo
asistido, la detención ante errores y la recuperación con la misma identidad.

## Comparación controlada

La prueba de componente simula seis respuestas consecutivas de ocho segundos
(alta y cinco avances). Mide desde el CTA hasta invocar el checkout existente;
no incluye la latencia de crear la preferencia ni de cargar Mercado Pago.

| Control | Base | Corrección |
| --- | --- | --- |
| Tiempo hasta iniciar checkout | 73.000 ms | Como máximo 48.010 ms |
| Altas | 1 | 1 |
| Avances | 5 | 5 |
| Avances simultáneos | 1 | 1 |
| Llamadas a checkout | 1 | 1 |

La mejora en este escenario es de aproximadamente 25 segundos (34%). No es una
medición de latencia productiva ni promete ese porcentaje para todas las compras.
El primer ensayo del arnés avanzaba todo el reloj dentro de un único `act`,
impidiendo los renders intermedios; se corrigió para avanzar un temporizador por
`act`. En la comparación válida sobre la base, 35 pruebas pasaron y dos fallaron
como se esperaba: 73.000 ms contra el límite de 48.010 ms y ausencia de reconsulta
inmediata al volver a la pestaña. Con la corrección, esas regresiones pasan.

La prueba de navegador demora ocho segundos simulados el alta y exige la
redirección sin avanzar otros cinco segundos. Intercepta todos los servicios de
compra y Mercado Pago; no crea reservas ni pagos reales. Comprueba un solo CTA,
el mensaje sencillo, ausencia de referencias internas y una sola redirección.

## Límite conservado

Por revisión del código, una preparación nueva con `n` productos necesita
`2n + 3` llamadas Dux: productos antes, creación, consulta de pedido, productos
después y consulta final. El paso de borrador local es adicional. El coordinador
existente separa inicios seis segundos y se comparte con la sincronización.
Para un producto, cinco llamadas implican al menos 24 segundos entre el primer
y último inicio, antes de considerar respuestas, D1, concurrencia o Mercado Pago.
Es una consecuencia del código vigente, no una medición productiva ni una nueva
afirmación sobre el contrato del proveedor. Esta corrección no elimina controles
de reserva ni adelanta preferencias para disimular ese tiempo.

## Validación

- Verificado: Node 24.18.0 y npm 11.16.0; `npm ci` e instalación de Chromium,
  ambos con salida 0. El audit informa las cuatro vulnerabilidades ya presentes
  (dos moderadas y dos altas); no se cambia el lockfile ni se agregan dependencias.
- Verificado: 95 pruebas dirigidas de preparación, retorno financiero, estado de
  pago, compra directa y coordinador Dux; seis archivos, salida 0.
- Verificado: 31 pruebas dirigidas adicionales de carrito, estado público,
  checkout público, preferencias y compra asistida; cinco archivos, salida 0.
- Verificado: `npm run verify`, salida 0; 120 archivos, 807 pruebas
  unitarias/integración aprobadas, 14 omisiones históricas y 30 E2E aprobados.
  Incluye lint, tipos, catálogo, pesos, build, assets, seguridad y automatización.
  Los avisos de `FORCE_COLOR`/`NO_COLOR` y `vite:prepare-out-dir` no son fallos.
- Verificado: `npm run build:pages`, salida 0; repite los 120 archivos,
  807 pruebas aprobadas y 14 omisiones históricas. Build, assets, seguridad y
  automatización aprobados. `dist` y resultados temporales quedan fuera de Git.
- Verificado: `git diff --check` y seis enlaces documentales relativos. Diff
  completo de los archivos propios, lockfile intacto y ausencia de secretos,
  binarios o datos personales nuevos: revisado por código. El control del índice
  y el hash de la modificación ajena se repiten antes del commit.
- No se mide Lighthouse/Core Web Vitals: el foco es posterior al CTA y no está
  disponible el conector Chrome DevTools en esta sesión.

## Publicación y smoke

El SHA final de CI y Pages debe comprobarse después del commit y push. La
publicación no aplica migraciones ni cambia configuración externa. El smoke
productivo se limita a lectura y navegación si no está disponible el cierre
operativo de una reserva. No se fabrica una aprobación productiva ni se cobra.
La latencia completa con Dux real permanece sin medir en esta corrección.
