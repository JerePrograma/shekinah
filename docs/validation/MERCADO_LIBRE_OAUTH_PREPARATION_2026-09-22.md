# Preparación de OAuth editorial — 2026-09-22

## Base y alcance

Se ejecutó el flujo Git obligatorio sobre `main`. El árbol inicial estaba limpio;
el fast-forward desde `4586eee08b6de15fc53a66c84d84be90c7145f7f` dejó la base real
`ca9bf852aa7c1afdf7182a68efe2415373e8ddf8`. El stash histórico autorizado permanece
sin aplicar ni eliminar. No se crearon ramas, PRs, worktrees ni stashes.

La conexión real requiere la aplicación propia de Mercado Libre y la sesión del
titular de HERBOLARIOMDP. El portal oficial abierto en esta sesión exige iniciar
sesión. Se dejó esa pantalla preparada para el titular; no se solicitó contraseña,
código, token ni decisión técnica. No se afirma que la aplicación exista o que
se haya creado, ni que se haya registrado el redirect externamente.

## Verificación remota y configuración realizada

Verificado mediante la API autenticada del proyecto **Pages** `shekinah`, dominio
técnico `shekinah-7dl.pages.dev`, producción desde `main`. No se operó el Worker
homónimo. Deployment inicial `8c8b561f-67d7-4a1b-8a6e-4e0821b0e050`, estado
`success`, SHA igual a la base. No equivale a CI aprobado.

| Control | Preview | Production |
| --- | --- | --- |
| D1 | `shekinah-commerce-preview` | `shekinah-commerce` |
| R2 | `shekinah-preview` | `shekinah` |
| `PUBLIC_SITE_URL` | `https://mp-sandbox.shekinah-7dl.pages.dev` | `https://shekinah.ar` |
| Empresa Dux | `12862` | `12862` |
| Productos del snapshot Dux leído | 749 | 863 |
| Conexiones OAuth / runs editoriales / asociaciones aprobadas | 0 / 0 / 0 | 0 / 0 / 0 |
| Client ID y Client Secret ML | ausentes | ausentes |
| Clave de cifrado ML | creada como `secret_text` | creada como `secret_text` |
| Seller esperado | configurado `445638367` | configurado `445638367` |
| Flag editorial | `false` | `false` |
| Inventario ML, servidor y frontend | `false` | `false` |
| `fail_open` | `false` | `false` |

Las claves se generaron con RNG criptográfico, 32 bytes y base64url sin padding,
independientes por entorno. Se enviaron directamente como secretos de Pages sin
imprimir ni persistir los valores en archivos. No se rotó una clave existente.
La relectura confirmó presencia/tipo, seller, bindings conservados y cero cambios
inesperados en las demás variables. Las credenciales Mercado Pago y Dux no se
leyeron ni cambiaron. Los valores guardados requieren deployment para acreditarse
en runtime; no se presenta esta preparación como `configured=true`.

Verificado: ambas D1 conservan 0001–0024 contiguas, objetos/guards editoriales de
0019 presentes y `foreign_key_check` vacío. Las consultas escribieron cero filas.
No se reaplicó ni modificó ninguna migración.

El navegador acreditó mantenimiento en el dominio canónico y `/admin` accesible
con su formulario de ingreso. No había sesión administrativa; por ello no se
afirma lectura autenticada de `editorial/status` ni botón visible. El dominio
técnico respondió 401 al status sin sesión y 410 al callback con editorial
deshabilitado; HEAD del callback respondió 405, `Allow: GET`, `no-store` y
`no-referrer`. El host local rechazó la cadena TLS del dominio canónico; no se
omitió validación de certificados. La navegación al callback canónico también
fue bloqueada por el cliente del navegador. El registro distingue esa limitación
del acceso visual normal al sitio y no atribuye una falla al certificado público.

## Código y CI inicial

Revisado por código: OAuth existente conserva URL oficial, state opaco con hash,
caducidad de diez minutos, consumo único, canje server-side, `/users/me`, seller
esperado, sitio MLA, AES-GCM, persistencia y lock de refresh. El callback se deriva
de `PUBLIC_SITE_URL` y en producción es
`https://shekinah.ar/api/oauth/mercadolibre/callback`.

La documentación oficial actual confirma aplicaciones ML/MP separadas, redirect
HTTPS exacto y PKCE opcional. La lectura editorial existente usa el multiget
actual `/items/bulk`, scan `active` y límites ya implementados. No se reconstruye
OAuth ni se cambia el guard del botón.

El [CI inicial](https://github.com/JerePrograma/shekinah/actions/runs/35777338832)
agotó veinte minutos y terminó `cancelled`: 121 archivos y 848 pruebas pasaron,
con 14 omisiones históricas, pero los E2E públicos encontraron mantenimiento y
acumularon fallas/reintentos. Los pasos posteriores y el artefacto quedaron
omitidos. Se conserva ese intento como evidencia.

La corrección agrega una variable de build cuyo default mantiene cerrado el
sitio; sólo `VITE_PUBLIC_MAINTENANCE_ENABLED=false` permite abrirlo. No tiene
control por query, sesión ni almacenamiento del navegador. Playwright prueba dos
builds aislados (normal y mantenimiento), sin sustituir el `dist` publicable.
Se mantienen los recorridos de catálogo, carrito, checkout y administración,
y se agrega comprobación del mantenimiento en rutas públicas y del login admin.

Se agregan pruebas de OAuth/status y de las acciones del panel: URL y callback,
state desconocido/vencido/consumido, seller/usuario del token/site incorrectos,
respuesta inválida, code rechazado, error sanitizado, cifrado, refresh,
persistencia, status sin secretos, método, sesión y mismo origen. Son datos
sintéticos; no acreditan autorización ni importación real.

## Validación local

Runtime verificado: Node.js 24.18.0 y npm 11.19.1, compatible con `package.json`.
No se cambiaron dependencias ni `package-lock.json`.

- `npm ci`: verificado, salida 0, 201 paquetes. Persisten los cuatro avisos de
  auditoría informados por npm (dos moderados y dos altos); no se ejecutó upgrade.
- `npm run install:browsers`: verificado, salida 0.
- Primer `npm run verify` sobre la base: interrumpido durante Vitest al confirmar
  por el CI remoto la incompatibilidad E2E con mantenimiento y preparar su ajuste;
  no se registra ese intento local como aprobado.
- `npm run typecheck` y
  `npm run test -- server/mercado-libre-oauth.test.ts src/admin/MercadoLibreEditorialPanel.test.tsx src/maintenance.test.ts`:
  verificados; tres archivos y 25 pruebas aprobadas.
- Primer `npm run verify` con los nuevos tests: fallido en lint por conversiones
  amplias y asignación JSON implícita del arnés OAuth. Se corrigieron los tipos
  de las aserciones; no cambió la implementación OAuth.
- `npm run verify` posterior: verificado, salida 0; 122 archivos, 868 pruebas
  aprobadas y 14 omisiones históricas. Lint, TypeScript, catálogos, pesos, build,
  activos, seguridad y automatización aprobados. Playwright: 36/36 en 1,2 minutos.
  Se usó `VITEST_MAX_WORKERS=2` sólo en el proceso local.
- `npm run build:pages`: verificado, salida 0; 122 archivos, 868 pruebas
  aprobadas, 14 omisiones históricas y todos los verificadores aprobados.
- `git diff --check`, enlaces documentales relativos y lockfile intacto:
  verificados. Diff completo y ausencia de secretos reales, binarios, `dist` y
  temporales entre las rutas a publicar: revisados por código.

## Continuación operativa

Después del ingreso del titular, localizar la aplicación ML existente o crearla
si no existe; verificar separación de Mercado Pago, permisos y redirects reales.
Registrar el callback canónico y el de Preview sólo conforme a la aplicación.
Cargar client ID/secret mediante el mecanismo seguro, habilitar editorial y
desplegar. Comprobar el botón con una sesión administrativa real y completar la
autorización del titular. No fabricar sesión ni cambiar credenciales admin.

Validar seller 445638367 / MLA, conexión cifrada y sync completo en Preview;
después acreditar producción. Revisar asociaciones exactas con presentación,
pack, variante y evidencia; importar campos aprobados y comprobar varios
productos manteniendo toda autoridad comercial Dux. Hasta entonces no hay
conteos de publicaciones activas, descartes, candidatos, ambiguos, sin match o
campos importados verificables. El scheduler editorial permanece cerrado.

No retirar mantenimiento antes de acreditar la secuencia completa solicitada.
El cierre informa por separado validación local, commit, CI del SHA final,
deployment y smokes; este registro no declara el objetivo operativo terminado.

## Fuentes oficiales

- [Aplicaciones Mercado Libre](https://developers.mercadolibre.com.ar/crea-una-aplicacion-en-mercado-libre-es).
- [Autenticación y autorización](https://developers.mercadolibre.com.ar/autenticacion-y-autorizacion).
- [Ítems y búsquedas](https://developers.mercadolibre.com.ar/es_ar/guia-para-carrito-de-compras/items-y-busquedas).
- [Configuración Pages por API](https://developers.cloudflare.com/api/typescript/resources/pages/subresources/projects/methods/edit/).
