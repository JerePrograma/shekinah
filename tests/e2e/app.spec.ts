import { expect, test } from '@playwright/test';

test('carga la base de Shekinah sin errores de consola', async ({ page }) => {
  const consoleErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Shekinah' })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Shekinah, hierbas y especias' }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
