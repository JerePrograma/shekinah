import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface SnapshotManifest {
  pages: Array<{ route: string; status: number }>;
}

const sourceOrigin = process.env.WORDPRESS_REFERENCE_URL;
if (!sourceOrigin) throw new Error('Falta WORDPRESS_REFERENCE_URL para la comparación visual.');
const manifest: SnapshotManifest = JSON.parse(
  await readFile(path.resolve('reference-snapshot/manifest.json'), 'utf8'),
);
const routes = manifest.pages.filter((page) => page.status === 200).map((page) => page.route);
if (routes.length === 0) throw new Error('El manifiesto no contiene páginas 200 para comparar.');

function slugForRoute(route: string) {
  return route === '/'
    ? 'home'
    : route.replaceAll(/[^a-zA-Z0-9]+/gu, '-').replaceAll(/^-+|-+$/gu, '');
}

async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
  await page.evaluate(async () => {
    for (const element of document.querySelectorAll('img, source, iframe, video')) {
      const source = element.getAttribute('data-src') ?? element.getAttribute('data-lazy-src');
      const sourceSet =
        element.getAttribute('data-srcset') ?? element.getAttribute('data-lazy-srcset');
      if (source) element.setAttribute('src', source);
      if (sourceSet) element.setAttribute('srcset', sourceSet);
      if ('loading' in element) element.setAttribute('loading', 'eager');
    }
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y <= height; y += Math.max(300, window.innerHeight * 0.75)) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            }),
      ),
    );
  });
}

for (const route of routes) {
  test(`${route} coincide con WordPress restaurado`, async ({ page, context }, testInfo) => {
    const sourcePage = await context.newPage();
    await Promise.all([
      sourcePage.goto(new URL(route, sourceOrigin).href, { waitUntil: 'domcontentloaded' }),
      page.goto(route, { waitUntil: 'domcontentloaded' }),
    ]);
    await Promise.all([settle(sourcePage), settle(page)]);

    const snapshotName = `${slugForRoute(route)}.png`;
    const expectedPath = testInfo.snapshotPath(snapshotName);
    await mkdir(path.dirname(expectedPath), { recursive: true });
    await writeFile(
      expectedPath,
      await sourcePage.screenshot({ fullPage: true, animations: 'disabled' }),
    );

    const actual = await page.screenshot({ fullPage: true, animations: 'disabled' });
    expect(actual).toMatchSnapshot(snapshotName, {
      maxDiffPixels: 0,
      threshold: 0,
    });
    await sourcePage.close();
  });
}
