import { expect, test } from '@playwright/test';

test('la portada utiliza las imágenes publicadas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.page-hero__image')).toHaveAttribute(
    'src',
    '/images/original/home-spice-chest.jpg',
  );
  await expect(page.locator('.feature-card img')).toHaveCount(3);
  await expect(page.locator('.feature-card img').first()).toHaveAttribute(
    'src',
    '/images/original/home-herb-jars.jpg',
  );
  await expect(page.locator('.split__image')).toHaveAttribute(
    'src',
    '/images/original/home-essence.png',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://jereprograma.github.io/shekinah/images/original/home-spice-chest.jpg',
  );
});

test('la galería de chocolate abre y se navega como diálogo', async ({ page }) => {
  await page.goto('/chocolate-casero/');
  const gallery = page.locator('.original-gallery');
  await expect(gallery).toBeVisible();
  await expect(gallery.locator('img')).toHaveCount(3);
  await gallery.getByRole('button').first().click();
  const dialog = page.getByRole('dialog', { name: 'Imagen ampliada' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('.lightbox__image')).toHaveAttribute(
    'src',
    '/images/original/chocolate-pour.jpg',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('nosotros muestra galería y testimonio', async ({ page }) => {
  await page.goto('/nosotros/');
  await expect(page.locator('.page-hero__image')).toHaveAttribute(
    'src',
    '/images/original/about-promise.png',
  );
  await expect(page.locator('.original-gallery img')).toHaveCount(2);
  await expect(page.getByLabel('Testimonio de Ana M.')).toContainText('★★★★★');
});

test('la tienda conserva carrito local y contacto explícito por WhatsApp', async ({ page }) => {
  await page.goto('/tienda/');
  await expect(page.getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute(
    'href',
    'https://wa.me/542236216559',
  );
  const cart = page.getByRole('button', { name: /Carrito \(0\)/u });
  await expect(cart).toBeVisible();
  await cart.click();
  await expect(page.getByRole('dialog', { name: 'Carrito' })).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
});
