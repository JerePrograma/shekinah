import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/catalog**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      schemaVersion: 2,
      source: 'dux',
      products: [],
      categories: [],
      manualCatalogRetired: true,
    }),
  }));
});

test('la decisión analítica no tapa controles y la navegación móvil mantiene las tres opciones juntas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  for (const width of [360, 390, 768, 1366, 1440]) {
    await page.setViewportSize({ width, height: width < 700 ? 640 : 900 });
    await page.goto('/privacidad');
    const controls = page.getByRole('region', { name: 'Tus controles' });
    const accept = controls.getByRole('button', { name: 'Aceptar analítica opcional' });
    await accept.scrollIntoViewIfNeeded();
    await accept.focus();
    await expect(accept).toBeFocused();
    await expect.poll(() => accept.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      ));
    })).toBe(true);

    const main = await page.locator('main').boundingBox();
    const consent = await page.getByRole('complementary', { name: 'Analítica opcional' }).boundingBox();
    expect(main).not.toBeNull();
    expect(consent).not.toBeNull();
    expect(consent!.y).toBeGreaterThanOrEqual(main!.y + main!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);

    if (width < 700) {
      const links = page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link');
      const boxes = await links.evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      }));
      expect(boxes).toHaveLength(3);
      expect(Math.max(...boxes.map((box) => box.top)))
        .toBeLessThan(Math.min(...boxes.map((box) => box.bottom)));
      for (const box of boxes) {
        expect(box.width).toBeGreaterThanOrEqual(24);
        expect(box.height).toBeGreaterThanOrEqual(24);
      }
    }
  }

  expect(errors).toEqual([]);
});

test('permite rechazar la analítica con teclado sin enviar eventos', async ({ page }) => {
  let events = 0;
  await page.route('**/api/analytics/events', (route) => {
    events += 1;
    return route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' });
  });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/privacidad');

  const consent = page.getByRole('complementary', { name: 'Analítica opcional' });
  await consent.getByRole('button', { name: 'Aceptar analítica', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(consent.getByRole('button', { name: 'Continuar sin analítica' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(consent).toHaveCount(0);
  await expect(page.getByText('Estado actual:')).toContainText('rechazada');
  expect(events).toBe(0);
});
