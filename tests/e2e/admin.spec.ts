import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

const FIXTURE_USERNAME = 'admin-e2e-ficticio';
const FIXTURE_PASSWORD = 'Clave-E2E-totalmente-ficticia-2026!';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('shekinah.analytics-consent.v1', 'rejected');
  });
});

test('UI simulada: inicia y cierra una sesión administrativa sin persistir credenciales', async ({ page }) => {
  // Vite Preview no ejecuta Pages Functions. Este estado simulado valida únicamente la UI;
  // la autenticación, cookie y autorización reales deben validarse en integración y en Pages.
  let authenticated = false;
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/admin/auth/session' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(authenticated
          ? {
              authenticated: true,
              identity: { label: 'Administración E2E', source: 'password' },
            }
          : { authenticated: false }),
      });
      return;
    }
    if (pathname === '/api/admin/auth/login' && request.method() === 'POST') {
      const credentials = request.postDataJSON() as Record<string, unknown>;
      if (
        credentials.username !== FIXTURE_USERNAME ||
        credentials.password !== FIXTURE_PASSWORD
      ) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INVALID_CREDENTIALS' } }),
        });
        return;
      }
      authenticated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          identity: { label: 'Administración E2E', source: 'password' },
        }),
      });
      return;
    }
    if (pathname === '/api/admin/auth/logout' && request.method() === 'POST') {
      authenticated = false;
      await route.fulfill({ status: 204 });
      return;
    }
    if (!authenticated) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'ADMIN_UNAUTHORIZED' } }),
      });
      return;
    }
    await fulfillProtectedAdminRoute(route, pathname);
  });

  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Usuario' })).toHaveAttribute(
    'autocomplete',
    'username',
  );
  await expect(page.getByLabel('Contraseña')).toHaveAttribute(
    'autocomplete',
    'current-password',
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Usuario' }).fill(FIXTURE_USERNAME);
  await page.getByLabel('Contraseña').fill('Credencial-ficticia-incorrecta');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'No se pudo iniciar sesión. Revisá las credenciales e intentá nuevamente.',
  );

  await page.getByLabel('Contraseña').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Administración / Backoffice' }),
  ).toBeVisible();
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page.getByRole('heading', { level: 2, name: 'Catálogo de productos' })).toBeVisible();
  await expect(page.getByText(/Sesión iniciada como/u)).toContainText('Administración E2E');

  const storedValues = await page.evaluate(() => JSON.stringify({
    local: Object.values(window.localStorage),
    session: Object.values(window.sessionStorage),
  }));
  expect(storedValues).not.toContain(FIXTURE_PASSWORD);

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Usuario' })).toBeFocused();
  const protectedStatus = await page.evaluate(async () => {
    const response = await fetch('/api/admin/products', { credentials: 'same-origin' });
    return response.status;
  });
  expect(protectedStatus).toBe(401);

  await page.getByRole('link', { name: 'Shekinah, ir al inicio' }).click();
  await expect(page).toHaveURL(/\/$/u);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/$/u);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();
});

async function fulfillProtectedAdminRoute(
  route: Route,
  pathname: string,
): Promise<void> {
  if (pathname === '/api/admin/products') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ products: [] }),
    });
    return;
  }
  if (pathname === '/api/admin/summary') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
    return;
  }
  if (pathname === '/api/admin/orders' || pathname === '/api/admin/audit') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows: [] }),
    });
    return;
  }
  if (pathname.startsWith('/api/admin/analytics/')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
    return;
  }
  await route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'NOT_FOUND' } }),
  });
}
