# Continuación del proyecto

## Propósito

Este documento define cómo retomar Shekinah desde una sesión nueva sin depender de conversaciones anteriores.

No sustituye al código, las pruebas ni el historial. Toda afirmación debe revalidarse contra el estado real de `origin/main`.

## Ruta de lectura

Leer en este orden:

1. `README.md` — producto y comandos básicos;
2. `AGENTS.md` — reglas operativas e invariantes;
3. `docs/CURRENT_STATE.md` — fotografía compacta y límites de evidencia;
4. `docs/ARCHITECTURE.md` — responsabilidades técnicas;
5. `docs/PROVENANCE.md` — fuentes y conservación del historial;
6. `docs/AUTHORIZED_ASSETS.md` — único activo permitido;
7. `docs/ACCESSIBILITY.md` — contrato de accesibilidad;
8. `docs/DEPLOYMENT.md` — CI frente a Cloudflare Pages;
9. `docs/REIMPLEMENTATION_PROGRESS.md` — secuencia acumulada;
10. `docs/design/` — decisiones por bloque;
11. `docs/validation/` — evidencia histórica y resultados.

No detener la lectura de un registro de validación en su estado inicial. Las secciones de publicación definitiva pueden cerrar una candidata que al comienzo figura como pendiente.

## Inicio obligatorio

```bash
git status
git switch main
git fetch origin
git pull --ff-only origin main
git status
git log --oneline --decorate -n 20
```

Registrar:

- rama activa;
- SHA local;
- SHA de `origin/main`;
- cambios locales rastreados y no rastreados;
- commits nuevos desde la última fotografía;
- disponibilidad de Node.js, npm, Chromium, GitHub Actions y Cloudflare Pages.

Si existen cambios locales ajenos, preservarlos. Continuar solamente cuando el alcance pueda aislarse sin sobrescribirlos.

## Descubrimiento previo a cualquier edición

Inspeccionar como mínimo:

- `package.json` y `package-lock.json`;
- `.node-version`;
- `tsconfig.json`;
- `eslint.config.js`;
- `vite.config.ts`;
- `vitest.config.ts`;
- `playwright.config.ts`;
- `.github/workflows/`;
- `src/`;
- `public/`;
- `scripts/`;
- `tests/`;
- todos los Markdown relevantes al objetivo.

Buscar:

- símbolos y usos afectados;
- pruebas existentes;
- TODO, FIXME y contradicciones reales;
- issues y pull requests vigentes;
- datos comerciales no autorizados;
- recursos externos;
- secretos;
- afirmaciones de despliegue sin evidencia;
- regresiones respecto de los bloques publicados.

## Cómo determinar el próximo bloque

No crear un bloque por continuidad numérica.

Aplicar esta prioridad:

1. cerrar documentación o evidencia operativa incompleta;
2. verificar CI del SHA actual;
3. verificar despliegue público y encabezados;
4. corregir regresiones demostrables;
5. implementar un requisito explícito hallado en código, documentación o issue vigente;
6. realizar una mejora técnica pequeña con beneficio observable y sin depender de datos inexistentes.

Un issue técnico antiguo, un payload, un disparador o una candidata ya publicada no constituye por sí solo un requisito vigente.

Si no existe un objetivo funcional explícito después del BLOQUE 6, conservar la aplicación y limitar el trabajo al cierre operativo. No añadir productos o contacto para llenar estados vacíos.

## Decisiones estables

Mientras el repositorio no demuestre una decisión posterior:

- la aplicación es una SPA estática;
- las rutas se resuelven con History API;
- no existe backend, base de datos ni autenticación;
- los datos comerciales se centralizan en `src/data/authorized-commercial-data.ts`;
- una colección pública vacía es válida;
- el único activo visual es el logo autorizado;
- GitHub Actions valida y no despliega;
- Cloudflare Pages debe tratarse como integración Git hasta demostrar otra modalidad;
- una vista 404 de aplicación puede responder HTTP `200` bajo el fallback SPA;
- el historial Git se conserva y no se reescribe.

Modificar una de estas decisiones exige evidencia, alcance explícito, pruebas y actualización coordinada de documentación y verificadores.

## Contrato de pruebas

### Instalación

```bash
npm ci
```

Debe respetar `package-lock.json`. Un cambio documental no justifica modificar dependencias ni lockfile.

### Validación completa

```bash
npm run install:browsers
npm run verify
```

`npm run verify` ejecuta, en este orden lógico:

- ESLint;
- TypeScript sin emisión;
- Vitest;
- build de Vite;
- integridad del logo;
- auditoría estática de seguridad;
- auditoría de automatización;
- Playwright E2E.

### Build para Pages

```bash
npm run build:pages
```

Ejecuta lint, tipos, Vitest, build y verificadores estáticos. No ejecuta Playwright. La salida esperada es `dist`.

### Pruebas actuales

- `src/App.test.tsx` — estructura compartida, rutas, privacidad, catálogo vacío y año dinámico;
- `src/catalog/catalog.test.ts` — modelo, precios, duplicados, normalización y filtros;
- `src/catalog/CatalogSection.test.tsx` — estados y controles del catálogo;
- `src/routing/routes.test.ts` — rutas conocidas, normalización y 404;
- `tests/e2e/app.spec.ts` — navegación, metadatos, solicitudes del mismo origen, errores de runtime, privacidad, 404, foco y ancho móvil.

### Verificadores

- `scripts/verify-assets.mjs` — logo;
- `scripts/verify-security.mjs` — encabezados, CSP, secretos, recursos, fallback y `dist`;
- `scripts/verify-automation.mjs` — Node.js, scripts, workflow, permisos, acciones y documentos obligatorios.

### Comprobaciones Git

```bash
git diff --check
git diff --cached --check
git status --short
git diff --stat
git diff --cached --stat
```

Revisar el contenido completo del diff, no solamente el resumen.

### Pruebas manuales

Cuando cambie comportamiento o presentación, revisar como mínimo:

- `/`;
- `/enfoque`;
- `/catalogo`;
- `/privacidad`;
- una ruta inexistente;
- navegación por teclado;
- foco después de navegación cliente;
- escritorio y 390 px de ancho;
- ausencia de errores de consola;
- ausencia de solicitudes externas;
- encabezados servidos por producción.

Las pruebas automatizadas no sustituyen una revisión manual con tecnologías de asistencia cuando cambia la interfaz.

## Criterio para afirmar éxito

Una tarea puede declararse terminada solamente cuando:

- el objetivo y alcance están respaldados por evidencia;
- el diff contiene solo archivos relacionados;
- las validaciones requeridas fueron ejecutadas y aprobadas;
- las pruebas no ejecutadas están declaradas;
- el commit fue publicado sin force-push;
- `origin/main` contiene el commit;
- CI y despliegue se clasifican según evidencia real.

Usar estas categorías:

- `verificado`: comando o comprobación ejecutada con evidencia;
- `revisado por código`: conclusión obtenida por lectura estática;
- `no disponible`: herramienta, acceso o dato externo inaccesible;
- `fallido`: control ejecutado con resultado no satisfactorio.

## Verificación de CI

Para el SHA final:

1. localizar el run de `.github/workflows/ci.yml` disparado por push;
2. comprobar conclusión y SHA;
3. inspeccionar el job `Verify` y sus pasos;
4. confirmar el artefacto `shekinah-dist-<sha>`;
5. revisar logs si existe un fallo;
6. no atribuir una causa sin evidencia del primer paso fallido.

La ausencia de estados en una API parcial no demuestra que no exista un run. Registrar la limitación concreta del acceso utilizado.

## Verificación de Cloudflare Pages

Comprobar externamente:

- URL pública;
- rama y SHA desplegados;
- resultado del build;
- `/`, `/enfoque`, `/catalogo`, `/privacidad` y una ruta desconocida;
- contenido coherente con el árbol;
- ausencia de productos y contacto no autorizados;
- encabezados de `public/_headers`.

No inferir el SHA desplegado a partir del contenido visual. La evidencia debe provenir del panel, metadatos de despliegue o una fuente equivalente.

## Publicación

Antes de commitear:

1. ejecutar `git fetch origin`;
2. comprobar que `origin/main` no avanzó de forma incompatible;
3. preparar rutas explícitas;
4. ejecutar `git diff --cached --check`;
5. revisar el stage;
6. crear un commit atómico;
7. ejecutar `git push origin main`;
8. volver a hacer fetch;
9. comprobar el SHA remoto final;
10. observar CI.

No usar force-push.

## Bloqueos reales

Detenerse y pedir intervención únicamente ante:

- credenciales o permisos ausentes;
- conflicto que no pueda resolverse sin alterar trabajo ajeno;
- riesgo de pérdida de datos;
- cambio irreversible de producción;
- decisión comercial que exija inventar o elegir información no autorizada.

Las limitaciones de una herramienta concreta deben documentarse; no justifican afirmar verificaciones inexistentes.

## Informe final

Incluir:

- resumen;
- estado inicial;
- documentación;
- implementación;
- archivos modificados;
- validación clasificada;
- CI y despliegue;
- commits y SHA remoto final;
- pendientes reales;
- confirmación de force-push no utilizado.
