# Informe de pruebas

<!-- SHEKINAH-VERIFICATION:START -->

## Verificación más reciente de Shekinah

Fecha UTC: **2026-07-22T18:23:41Z**.

Aprobados: `npm ci`, Chromium, Astro check, ESLint, Prettier, integridad y contrato semántico del snapshot, build, unitarias, smoke tests PowerShell, E2E, auditoría de salida, auditoría de secretos, fidelidad visual con `maxDiffPixels: 0` y validación remota.

- Páginas: 12
- Redirecciones: 1
- Recursos: 67
- Archivos: 87
- Formularios: 0
- Errores HTTP: 0
- Errores de consola: 0
- Páginas no recuperables: 0

<!-- SHEKINAH-VERIFICATION:END -->

Fecha: **2026-07-22**.

Commit de snapshot: `91761a6fdb64da05b54331524d11577ae3670032`.

| Control                            | Resultado                                  |
| ---------------------------------- | ------------------------------------------ |
| Node / npm                         | PASS: 24.18.0 / 11.16.0                    |
| `npm ci`                           | PASS: 394 paquetes                         |
| `npm run verify:snapshot:required` | PASS: 88 archivos, 14 páginas, 68 recursos |
| `npm run check`                    | PASS: 46 archivos, 0 diagnósticos          |
| `npm run lint`                     | PASS                                       |
| `npm run format:check`             | PASS                                       |
| `npm run build`                    | PASS: 88 archivos copiados a `dist`        |
| `npm run test:unit`                | PASS: 7/7                                  |
| `npm run test:powershell`          | PASS                                       |
| `npm run test:e2e`                 | PASS: 48/48                                |
| `npm run audit:output`             | PASS: 89 archivos; mayor 12.121.791 bytes  |
| `npm run audit:secrets`            | PASS: 0 hallazgos                          |
| `npm run test:fidelity`            | PASS: 42/42 en 9,5 min                     |

La fidelidad usó Chromium, `deviceScaleFactor: 1`, un worker, viewports exactos 375 × 812, 768 × 1024 y 1440 × 1200, `maxDiffPixels: 0` y `threshold: 0`.

El manifiesto registra 14 formularios neutralizados, 0 errores HTTP, 0 errores de consola y 0 páginas no recuperables. CI repitió satisfactoriamente todos los gates remotos aplicables en el run [29925014757](https://github.com/JerePrograma/shekinah/actions/runs/29925014757).
