# Verificación final de CI

- Commit verificado: `0254bc2557fb1aa243287440d1731215e2d46092`
- Inicio UTC: **2026-07-21T01:38:03Z**
- Runner: **GitHub Actions / ubuntu-latest**
- Node: **v24.18.0**
- npm: **11.16.0**

## Resultados

| Control                  | Comando                                       | Código | Resultado    |
| ------------------------ | --------------------------------------------- | -----: | ------------ |
| Instalación reproducible | `npm ci`                                      |      0 | **APROBADO** |
| Chromium de Playwright   | `npx playwright install --with-deps chromium` |      0 | **APROBADO** |
| Astro y TypeScript       | `npm run check`                               |      0 | **APROBADO** |
| ESLint                   | `npm run lint`                                |      0 | **APROBADO** |
| Prettier                 | `npm run format:check`                        |      1 | **FALLÓ**    |

### Error: Prettier

```text

> shekinah-static-site@1.0.0 format:check
> prettier --check .

Checking formatting...
[warn] docs/CI-VERIFICATION.md
[warn] Code style issues found in the above file. Run Prettier with --write to fix.

```

| Build estático | `npm run build` | 0 | **APROBADO** |
| Pruebas unitarias | `npm run test:unit` | 0 | **APROBADO** |
| Pruebas de navegador | `npx playwright test` | 1 | **FALLÓ** |

### Error: Pruebas de navegador

```text
[40/45] [desktop] › tests/e2e/site.spec.ts:17:3 › /terms-and-conditions/ responde y tiene SEO básico
[41/45] [desktop] › tests/e2e/site.spec.ts:28:1 › la navegación principal es utilizable con teclado
[42/45] [desktop] › tests/e2e/site.spec.ts:43:1 › todas las imágenes cargan
[43/45] [desktop] › tests/e2e/site.spec.ts:70:1 › rutas históricas redirigen
[44/45] [desktop] › tests/e2e/site.spec.ts:75:1 › sitemap, robots y 404 están disponibles
[45/45] [desktop] › tests/e2e/site.spec.ts:81:1 › el HTML no contiene dependencias heredadas
[46/45] (retries) [tablet] › tests/e2e/site.spec.ts:28:1 › la navegación principal es utilizable con teclado (retry #1)
[47/45] (retries) [tablet] › tests/e2e/site.spec.ts:28:1 › la navegación principal es utilizable con teclado (retry #2)
  1) [tablet] › tests/e2e/site.spec.ts:28:1 › la navegación principal es utilizable con teclado ────

    Test timeout of 30000ms exceeded.

    Error: locator.focus: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for getByRole('button', { name: 'Abrir menú' })


      30 |   if (isMobile) {
      31 |     const toggle = page.getByRole('button', { name: 'Abrir menú' });
    > 32 |     await toggle.focus();
         |                  ^
      33 |     await page.keyboard.press('Enter');
      34 |     await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      35 |   }
        at /home/runner/work/shekinah/shekinah/tests/e2e/site.spec.ts:32:18

    Error Context: test-results/site-la-navegación-principal-es-utilizable-con-teclado-tablet/error-context.md

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Test timeout of 30000ms exceeded.

    Error: locator.focus: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for getByRole('button', { name: 'Abrir menú' })


      30 |   if (isMobile) {
      31 |     const toggle = page.getByRole('button', { name: 'Abrir menú' });
    > 32 |     await toggle.focus();
         |                  ^
      33 |     await page.keyboard.press('Enter');
      34 |     await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      35 |   }
        at /home/runner/work/shekinah/shekinah/tests/e2e/site.spec.ts:32:18

    Error Context: test-results/site-la-navegación-principal-es-utilizable-con-teclado-tablet-retry1/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/site-la-navegación-principal-es-utilizable-con-teclado-tablet-retry1/trace.zip
    Usage:

        npx playwright show-trace test-results/site-la-navegación-principal-es-utilizable-con-teclado-tablet-retry1/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

    Retry #2 ───────────────────────────────────────────────────────────────────────────────────────

    Test timeout of 30000ms exceeded.

    Error: locator.focus: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for getByRole('button', { name: 'Abrir menú' })


      30 |   if (isMobile) {
      31 |     const toggle = page.getByRole('button', { name: 'Abrir menú' });
    > 32 |     await toggle.focus();
         |                  ^
      33 |     await page.keyboard.press('Enter');
      34 |     await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      35 |   }
        at /home/runner/work/shekinah/shekinah/tests/e2e/site.spec.ts:32:18

    Error Context: test-results/site-la-navegación-principal-es-utilizable-con-teclado-tablet-retry2/error-context.md


  1 failed
    [tablet] › tests/e2e/site.spec.ts:28:1 › la navegación principal es utilizable con teclado ─────
  44 passed (1.6m)

```

| Auditoría de salida | `npm run audit:output` | 0 | **APROBADO** |
| Auditoría de secretos | `npm run audit:secrets` | 0 | **APROBADO** |
| Auditoría de dependencias de producción | `npm audit --omit=dev --audit-level=high` | 0 | **APROBADO** |

## Conclusión

Verificación **FALLÓ**.

- Fin UTC: **2026-07-21T01:40:31Z**
- El informe fue generado por GitHub Actions sobre el commit indicado.
- Los adjuntos originales no fueron utilizados.
