import { expect, test } from '@playwright/test';

test('la portada utiliza las imágenes originales recuperadas', async ({ page }) => {
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
});

test('la galería original de chocolate abre y se navega como diálogo', async ({ page }) => {
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

test('nosotros recupera galería y testimonio original', async ({ page }) => {
  await page.goto('/nosotros/');
  await expect(page.locator('.page-hero__image')).toHaveAttribute(
    'src',
    '/images/original/about-promise.png',
  );
  await expect(page.locator('.original-gallery img')).toHaveCount(2);
  await expect(page.getByLabel('Testimonio de Ana M.')).toContainText('★★★★★');
});

test('la tienda conserva una acción de contacto funcional sin inventar carrito', async ({ page }) => {
  await page.goto('/tienda/');
  const contact = page.getByRole('link', { name: 'Consultar por correo' });
  await expect(contact).toHaveAttribute('href', /mailto:german\.gauna@yahoo\.com\.ar/u);
  await expect(page.locator('form')).toHaveCount(0);
});
