import { expect, test, type APIRequestContext } from '@playwright/test';

const criticalRoutes = [
  '/',
  '/nosotros/',
  '/tienda/',
  '/blog/',
  '/recetas/',
  '/chocolate-casero/',
  '/receta-barra-de-cereal/',
  '/el-viaje-de-las-especias-sabor-y-bienestar/',
  '/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/',
  '/terms-and-conditions/',
];

for (const route of criticalRoutes) {
  test(`${route} responde y tiene SEO básico`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveTitle(/\S+/u);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S+/u);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https:\/\//u);
    await expect(page.locator('main')).toBeVisible();
  });
}

test('la navegación principal es utilizable con teclado', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    const toggle = page.getByRole('button', { name: 'Abrir menú' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }

  const primaryNavigation = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(primaryNavigation).toBeVisible();
  await primaryNavigation.getByRole('link', { name: 'Nosotros' }).click();
  await expect(page).toHaveURL(/\/nosotros\/$/u);
});

test('todas las imágenes cargan', async ({ page }) => {
  await page.goto('/');
  const images = page.locator('img');
  await expect(images.first()).toBeVisible();

  for (let index = 0; index < (await images.count()); index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
});

async function expectRedirect(request: APIRequestContext, route: string, target: string) {
  const response = await request.get(route, { maxRedirects: 0 });
  if ([301, 302, 307, 308].includes(response.status())) {
    expect(response.headers().location).toBe(target);
    return;
  }

  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('http-equiv="refresh"');
  expect(html).toContain(`url=${target}`);
}

test('rutas históricas redirigen', async ({ request }) => {
  await expectRedirect(request, '/inicio/', '/');
  await expectRedirect(request, '/terminos-condiciones/', '/terms-and-conditions/');
});

test('sitemap, robots y 404 están disponibles', async ({ request }) => {
  expect((await request.get('/robots.txt')).status()).toBe(200);
  expect((await request.get('/sitemap-index.xml')).status()).toBe(200);
  expect((await request.get('/ruta-inexistente/')).status()).toBe(404);
});

test('el HTML no contiene dependencias heredadas', async ({ request }) => {
  const forbidden = [
    'hostinger',
    'litespeed',
    'wordpress',
    'wp-content',
    'wp-admin',
    'localhost',
    'chocolate-chimpanzee-908881',
  ];
  for (const route of criticalRoutes) {
    const html = await (await request.get(route)).text();
    for (const token of forbidden) expect(html.toLowerCase()).not.toContain(token);
  }
});
