# Plan del BLOQUE 6

## Título adoptado

CI, Cloudflare Pages y documentación operativa.

## Origen del alcance

La secuencia histórica recuperada no asignaba un nombre exacto al bloque posterior al BLOQUE 5. Este título se adopta para agrupar requisitos pendientes que sí estaban confirmados: GitHub Actions, preparación de Cloudflare Pages y documentación técnica obligatoria.

## Estado

Plan iniciado. Candidata ejecutable pendiente.

## Base remota

- repositorio: `JerePrograma/shekinah`;
- rama: `main`;
- SHA de partida: `694681033cdb5573d12ac455e6ff7f7a65545954`;
- BLOQUE 5: verificado y publicado.

## Decisión de automatización

Se incorporará un único workflow de integración continua, sin permisos de escritura y sin credenciales de despliegue.

El workflow deberá:

- ejecutarse en pushes a `main`, pull requests y ejecución manual;
- usar Node.js `24.18.0`;
- instalar dependencias con `npm ci`;
- instalar Chromium y sus dependencias del sistema;
- ejecutar `npm run verify`;
- publicar `dist` como artefacto efímero únicamente después de una validación exitosa;
- cancelar ejecuciones obsoletas de la misma referencia;
- limitar permisos a `contents: read`;
- usar acciones oficiales fijadas a SHA completo;
- desactivar la persistencia de credenciales de checkout.

## Decisión de despliegue

La ruta operativa recomendada para el proyecto existente es Cloudflare Pages mediante integración Git, no un workflow de despliegue con Wrangler.

Motivos:

- el modo real del proyecto Cloudflare debe confirmarse en el panel antes de añadir automatización de despliegue;
- Git integration y Direct Upload no son modos intercambiables de forma libre;
- añadir un workflow con `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` sin confirmar el modo crearía complejidad y credenciales innecesarias;
- el repositorio puede quedar completamente preparado para que Pages construya cada push a `main` sin almacenar secretos.

Configuración objetivo documentada:

- rama de producción: `main`;
- directorio raíz: raíz del repositorio;
- comando de build: `npm run build:pages`;
- directorio de salida: `dist`;
- versión de Node.js: `24.18.0`;
- proyecto previsto: `shekinah`;
- URL conocida que debe verificarse en el panel: `shekinah-7dl.pages.dev`.

No se afirmará que el despliegue está conectado o actualizado hasta verificarlo mediante el panel o evidencia de una ejecución real.

## Alcance autorizado

- añadir `.node-version`;
- añadir un workflow CI único y de solo lectura;
- añadir un verificador estático de automatización;
- añadir `build:pages` y `verify:automation` a los scripts del proyecto;
- integrar `verify:automation` en `npm run verify`;
- ampliar `README.md`;
- crear documentación de procedencia, activos autorizados, arquitectura, accesibilidad, despliegue y terceros;
- documentar la separación entre CI y despliegue;
- documentar pasos manuales verificables para conectar o revisar Cloudflare Pages;
- mantener intacta la aplicación publicada en el BLOQUE 5.

## Archivos previstos

- `.github/workflows/ci.yml`;
- `.node-version`;
- `README.md`;
- `package.json`;
- `scripts/verify-automation.mjs`;
- `docs/PROVENANCE.md`;
- `docs/AUTHORIZED_ASSETS.md`;
- `docs/ARCHITECTURE.md`;
- `docs/ACCESSIBILITY.md`;
- `docs/DEPLOYMENT.md`;
- `docs/THIRD_PARTY_NOTICES.md`;
- `docs/design/BLOCK_6_AUTOMATION_DEPLOYMENT.md`;
- `docs/validation/BLOCK_6_VALIDATION.md`.

## Exclusiones

Este bloque no incorpora:

- cambios visuales o funcionales en React;
- productos o datos de contacto;
- dependencias npm nuevas;
- Wrangler;
- Cloudflare Pages Functions;
- tokens, secretos, IDs de cuenta o credenciales;
- un workflow con permisos de escritura;
- un workflow `pull_request_target`;
- despliegue automático desde GitHub Actions;
- configuración de dominio personalizado;
- analítica, trackers o publicidad;
- cambios de DNS;
- afirmaciones de despliegue no verificadas.

## Reglas de seguridad del workflow

- debe existir exactamente un archivo dentro de `.github/workflows`;
- las acciones externas deben limitarse a acciones oficiales de GitHub fijadas a SHA completo;
- `actions/checkout` debe usar `persist-credentials: false`;
- no deben aparecer expresiones de secretos;
- no deben existir permisos `write`;
- no se permite `pull_request_target`;
- no se permite ejecutar código de despliegue;
- no se permite usar `curl`, `wget`, PowerShell remoto o payloads codificados;
- el artefacto debe limitarse a `dist`.

## Criterios de aceptación

1. `.node-version` fija Node.js `24.18.0`;
2. el workflow usa acciones oficiales fijadas a SHA completo;
3. el workflow tiene permisos mínimos;
4. el workflow ejecuta instalación reproducible;
5. Chromium se instala con dependencias del sistema;
6. `npm run verify` se ejecuta sin sustituciones;
7. `dist` se publica solamente después del éxito;
8. no existen secretos ni pasos de despliegue;
9. existe un único workflow;
10. `npm run build:pages` valida y genera `dist` sin Playwright;
11. `npm run verify` incluye la auditoría de automatización;
12. el verificador rechaza permisos, acciones o comandos no autorizados;
13. la documentación obligatoria existe y describe el estado real;
14. la documentación no afirma que Cloudflare esté conectado sin evidencia;
15. no cambian archivos de la aplicación;
16. no cambian dependencias ni `package-lock.json`;
17. `git diff --check` resulta limpio;
18. la validación completa sigue aprobada.

## Validación requerida antes de publicar

1. comprobar que `origin/main` coincide con la base registrada;
2. comprobar SHA-256 y lista exacta del candidato;
3. aplicar el candidato en una exportación limpia;
4. inicializar Git temporal antes de ejecutar verificadores que usan `git ls-files`;
5. ejecutar `npm ci`;
6. instalar Chromium con dependencias del sistema cuando la plataforma lo requiera;
7. ejecutar `npm run verify`;
8. ejecutar `npm run build:pages`;
9. ejecutar `npm run verify:automation` de forma independiente;
10. comprobar que `package-lock.json` no cambió;
11. comprobar que no cambió ningún archivo de aplicación;
12. ejecutar `git diff --check`;
13. revisar manualmente el workflow y la documentación;
14. publicar mediante fast-forward solamente después de un resultado íntegramente exitoso.
