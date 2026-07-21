# Verificación final de CI

- Commit verificado: `d097017d80b08b43ba838166f418abae9d6edcbd`
- Inicio UTC: **2026-07-21T01:32:27Z**
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
[[33mwarn[39m] docs/CI-VERIFICATION.md
[[33mwarn[39m] docs/MIGRATION-REPORT.md
[[33mwarn[39m] docs/MIGRATION-STATUS.md
[[33mwarn[39m] docs/TEST-REPORT.md
[[33mwarn[39m] README.md
[[33mwarn[39m] Code style issues found in 5 files. Run Prettier with --write to fix.

```

| Build estático | `npm run build` | 0 | **APROBADO** |
| Pruebas unitarias | `npm run test:unit` | 0 | **APROBADO** |
| Pruebas de navegador | `npx playwright test` | 1 | **FALLÓ** |

### Error: Pruebas de navegador

```text


      35 |   }
      36 |   await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    > 37 |   await page.getByRole('link', { name: 'Nosotros' }).click();
         |                                                      ^
      38 |   await expect(page).toHaveURL(/\/nosotros\/$/u);
      39 | });
      40 |
        at /home/runner/work/shekinah/shekinah/tests/e2e/site.spec.ts:37:54

    Error Context: test-results/site-la-navegación-principal-es-utilizable-con-teclado-desktop/error-context.md

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: locator.click: Error: strict mode violation: getByRole('link', { name: 'Nosotros' }) resolved to 2 elements:
        1) <a href="/nosotros/" data-astro-cid-6stfpryv="">Nosotros</a> aka getByLabel('Navegación principal').getByRole('link', { name: 'Nosotros' })
        2) <a href="/nosotros/" data-astro-cid-kl7gxbjz="">Nosotros</a> aka getByLabel('Navegación de pie de página').getByRole('link', { name: 'Nosotros' })

    Call log:
      - waiting for getByRole('link', { name: 'Nosotros' })


      35 |   }
      36 |   await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    > 37 |   await page.getByRole('link', { name: 'Nosotros' }).click();
         |                                                      ^
      38 |   await expect(page).toHaveURL(/\/nosotros\/$/u);
      39 | });
      40 |
        at /home/runner/work/shekinah/shekinah/tests/e2e/site.spec.ts:37:54

    Error Context: test-results/site-la-navegación-principal-es-utilizable-con-teclado-desktop-retry1/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/site-la-navegación-principal-es-utilizable-con-teclado-desktop-retry1/trace.zip
    Usage:

        npx playwright show-trace test-results/site-la-navegación-principal-es-utilizable-con-teclado-desktop-retry1/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

    Retry #2 ───────────────────────────────────────────────────────────────────────────────────────

    Error: locator.click: Error: strict mode violation: getByRole('link', { name: 'Nosotros' }) resolved to 2 elements:
        1) <a href="/nosotros/" data-astro-cid-6stfpryv="">Nosotros</a> aka getByLabel('Navegación principal').getByRole('link', { name: 'Nosotros' })
        2) <a href="/nosotros/" data-astro-cid-kl7gxbjz="">Nosotros</a> aka getByLabel('Navegación de pie de página').getByRole('link', { name: 'Nosotros' })

    Call log:
      - waiting for getByRole('link', { name: 'Nosotros' })


      35 |   }
      36 |   await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    > 37 |   await page.getByRole('link', { name: 'Nosotros' }).click();
         |                                                      ^
      38 |   await expect(page).toHaveURL(/\/nosotros\/$/u);
      39 | });
      40 |
        at /home/runner/work/shekinah/shekinah/tests/e2e/site.spec.ts:37:54

    Error Context: test-results/site-la-navegación-principal-es-utilizable-con-teclado-desktop-retry2/error-context.md


  14 failed
    [mobile] › tests/e2e/site.spec.ts:28:1 › la navegación principal es utilizable con teclado ─────
    [tablet] › tests/e2e/site.spec.ts:17:3 › / responde y tiene SEO básico ─────────────────────────
    [tablet] › tests/e2e/site.spec.ts:17:3 › /nosotros/ responde y tiene SEO básico ────────────────
    [tablet] › tests/e2e/site.spec.ts:17:3 › /tienda/ responde y tiene SEO básico ──────────────────
    [tablet] › tests/e2e/site.spec.ts:17:3 › /blog/ responde y tiene SEO básico ────────────────────
    [tablet] › tests/e2e/site.spec.ts:17:3 › /recetas/ responde y tiene SEO básico ─────────────────
    [tablet] › tests/e2e/site.spec.ts:17:3 › /chocolate-casero/ responde y tiene SEO básico ────────
    [tablet] › tests/e2e/site.spec.ts:17:3 › /receta-barra-de-cereal/ responde y tiene SEO básico ──
    [tablet] › tests/e2e/site.spec.ts:17:3 › /el-viaje-de-las-especias-sabor-y-bienestar/ responde y tiene SEO básico
    [tablet] › tests/e2e/site.spec.ts:17:3 › /el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/ responde y tiene SEO básico
    [tablet] › tests/e2e/site.spec.ts:17:3 › /terms-and-conditions/ responde y tiene SEO básico ────
    [tablet] › tests/e2e/site.spec.ts:28:1 › la navegación principal es utilizable con teclado ─────
    [tablet] › tests/e2e/site.spec.ts:41:1 › todas las imágenes cargan ─────────────────────────────
    [desktop] › tests/e2e/site.spec.ts:28:1 › la navegación principal es utilizable con teclado ────
  31 passed (20.4s)

```

| Auditoría de salida | `npm run audit:output` | 0 | **APROBADO** |
| Auditoría de secretos | `npm run audit:secrets` | 0 | **APROBADO** |
| Auditoría de dependencias de producción | `npm audit --omit=dev --audit-level=high` | 0 | **APROBADO** |

## Conclusión

Verificación **FALLÓ**.

- Fin UTC: **2026-07-21T01:33:43Z**
- El informe fue generado por GitHub Actions sobre el commit indicado.
- Los adjuntos originales no fueron utilizados.
