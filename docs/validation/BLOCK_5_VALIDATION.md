# Validación del BLOQUE 5

## Estado

Candidata v2 preparada. Validación ejecutable y revisión visual pendientes.

## Base esperada

La candidata debe aplicarse sobre el commit documental que registra su identidad exacta.

## Archivos candidatos

- `docs/design/BLOCK_5_NAVIGATION_SECURITY.md`;
- `docs/validation/BLOCK_5_VALIDATION.md`;
- `package.json`;
- `public/_headers`;
- `scripts/verify-security.mjs`;
- `src/App.test.tsx`;
- `src/App.tsx`;
- `src/catalog/CatalogSection.tsx`;
- `src/content/site-content.ts`;
- `src/main.tsx`;
- `src/pages/ApproachPage.tsx`;
- `src/pages/CatalogPage.tsx`;
- `src/pages/HomePage.tsx`;
- `src/pages/NotFoundPage.tsx`;
- `src/pages/PrivacyPage.tsx`;
- `src/routing.css`;
- `src/routing/AppLink.tsx`;
- `src/routing/routes.test.ts`;
- `src/routing/routes.ts`;
- `src/routing/useBrowserRoute.ts`;
- `tests/e2e/app.spec.ts`.

## Controles cubiertos

- rutas conocidas;
- normalización de rutas;
- 404;
- navegación cliente;
- atrás y adelante;
- navegación directa;
- enlaces internos reales;
- ruta activa;
- metadatos;
- foco;
- un `h1` por vista;
- privacidad;
- catálogo vacío;
- contacto ausente;
- ausencia de peticiones externas;
- encabezados de Cloudflare Pages;
- CSP;
- secretos;
- activos autorizados;
- fallback SPA;
- inspección de `dist`;
- ausencia de source maps;
- ausencia de funcionalidad excluida.

## Validación ejecutable requerida

1. comprobar la base remota;
2. comprobar SHA-256 y lista del candidato;
3. aplicar el candidato en una exportación limpia;
4. ejecutar `npm ci`;
5. instalar Chromium;
6. ejecutar `npm run verify`;
7. ejecutar `npm run verify:security`;
8. ejecutar `git diff --check`;
9. revisar capturas de inicio, privacidad, 404 y móvil;
10. confirmar que el catálogo permanezca vacío y el contacto permanezca ausente.

La candidata no debe publicarse hasta obtener un resultado `SUCCESS`.
## Publicación definitiva

- estado: `SUCCESS`;
- base validada: `6ccae0839ab7c114eac7fee096c7aa7b7eb5b6f5`;
- candidato v2 validado: `867fba2e3e8f4f71b920343acef828bb701e3df9f1198372e1742ba998db3d8f`;
- evidencia v2 validada: `711a8fd6eb92f27a32f80347fa0f44541efff4fa047d929dcd5d85fa7b216a53`;
- script de validación v2: `f47ecf420c588a3c575b1ac0db62ff0d01becd504d3e649c7172210af29b28ef`;
- intento de publicación v1: fallido antes de Git por un prechequeo incorrecto;
- ZIP de resultado fallido v1: `a3df0927340060ed281c44cc92e3ccb44b8e374ba1571bf8e789040725209b6d`;
- intento de publicación v2: fallido antes de aplicar el candidato porque el repositorio Git temporal todavía no estaba inicializado;
- ZIP de resultado fallido v2: `bb7ee39840db14ae396041b511f143290018691603d1da8b820f93122881e100`;
- intento de publicación v3: fallido por exigir una cadena de stderr que Start-Transcript no había conservado, aunque el resultado JSON estructurado era correcto;
- ZIP de resultado fallido v3: `1fe15c9064b7770b4529c44acc949cdb99fb757375d3b33ba36f43368f8201c3`;
- script de publicación v2: `bd9962128bf1646ddcb597fdd5b40a889e308b5c79756016e98fccc03ef7f17f`;
- script de publicación v3: `88973b3e7be6c568cb24626408805d89ba31d3141cc7619919cd89f84603cd72`;
- script de publicación v4: `8a495c347bacc85a464b63139e2f9b7d9162c1a029b9987ac395457a2301c233`;
- logo autorizado: `cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747`;
- encabezados estáticos: `960453de28aa7ddc8f370f6df21132d9cb33433d5005ba8c9776c4e9f9673b3a`;
- commit funcional: `5bc26706f5e971ae1bcb2c15ef46c1f6ed2b9bae`;
- productos autorizados: colección vacía;
- contacto autorizado: `null`;
- pruebas unitarias y de componentes: 21 aprobadas;
- build: aprobado;
- auditoría estática de seguridad: aprobada;
- pruebas E2E: 3 aprobadas;
- revisión visual: aprobada;
- publicación en `origin/main`: confirmada.

No se publicaron archivos funcionales distintos de los veintiún componentes del candidato.
