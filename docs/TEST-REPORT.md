# Informe de pruebas

Fecha: **2026-07-21**.

## Resultado local

| Control                            | Resultado                                     |
| ---------------------------------- | --------------------------------------------- |
| PowerShell parser                  | PASS: 2 scripts, módulo y smoke test          |
| `npm ci`                           | PASS: Node 24.18.0, npm 11.16.0, 394 paquetes |
| `npm run check`                    | PASS: 46 archivos, 0 diagnósticos             |
| `npm run lint`                     | PASS                                          |
| `npm run format:check`             | PASS                                          |
| `npm run verify:snapshot:required` | PASS: 88 archivos, 14 páginas, 68 recursos    |
| `npm run build`                    | PASS: 88 archivos copiados a `dist/`          |
| `npm run test:unit`                | PASS: 7/7                                     |
| `npm run test:powershell`          | PASS                                          |
| `npm run test:e2e`                 | PASS: 48/48                                   |
| `npm run audit:output`             | PASS: 89 archivos, mayor 12.121.791 bytes     |
| `npm run audit:secrets`            | PASS: 0 hallazgos                             |
| `npm run test:fidelity`            | PASS: 42/42 en 11,4 min                       |

La fidelidad usó Chromium, `deviceScaleFactor: 1`, viewports exactos 375×812, 768×1024 y 1440×1200, `maxDiffPixels: 0` y `threshold: 0`. Las imágenes externas se fijaron con los bytes SHA-256 versionados para eliminar negociación variable del CDN.

El manifiesto registra 0 errores HTTP, 0 errores de consola y 0 páginas no recuperables. Los 14 formularios visibles conservan su interfaz y están clasificados como procesamiento no migrado.

La verificación remota se documenta por separado después de cada push.
