import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateHomeHtml,
  validatePublicSettings,
  validatePublishedContent,
} from '../../scripts/wordpress-reference/content-validation.mjs';

const contract = {
  displayName: 'Shekinah',
  frontPageSlug: 'inicio',
  postsPageSlug: 'blog',
  requiredHomeText: ['Guía del Viajero', 'Nuestra esencia y pasión'],
  requiredNavigationPaths: ['/', '/nosotros/', '/tienda/', '/blog/', '/recetas/'],
  forbiddenVisibleText: ['Welcome to WordPress. This is your first post.', 'trans-menu'],
  forbiddenPublishedSlugs: ['hello-world'],
  maxStaticForms: 0,
};

const goodNavigation = `
<nav>
  <a href="/">Inicio</a>
  <a href="/nosotros/">Nosotros</a>
  <a href="/tienda/">Tienda</a>
  <a href="/blog/">Blog</a>
  <a href="/recetas/">Recetas</a>
</nav>`;

test('rechaza la portada predeterminada de WordPress', () => {
  const errors = validateHomeHtml(
    `<title>Shekinah</title>${goodNavigation}<main>Welcome to WordPress. This is your first post.</main>`,
    contract,
    'https://example.test/',
  );
  assert.ok(errors.some((error) => error.includes('texto prohibido')));
});

test('rechaza marcadores trans-* visibles', () => {
  const errors = validateHomeHtml(
    `<title>Shekinah</title>${goodNavigation}<main>Guía del Viajero Nuestra esencia y pasión trans-menu</main>`,
    contract,
    'https://example.test/',
  );
  assert.ok(errors.some((error) => error.includes('trans-menu')));
});

test('acepta la portada corregida de Shekinah', () => {
  const errors = validateHomeHtml(
    `<title>Shekinah</title>${goodNavigation}<main>Guía del Viajero Nuestra esencia y pasión</main>`,
    contract,
    'https://example.test/',
  );
  assert.deepEqual(errors, []);
});

test('valida portada estática y contenido publicado', () => {
  assert.deepEqual(
    validatePublicSettings(
      { blogname: 'Shekinah', show_on_front: 'page', page_on_front: '31', page_for_posts: '29' },
      contract,
    ),
    [],
  );
  assert.deepEqual(
    validatePublishedContent(
      [
        { post_type: 'page', post_name: 'inicio' },
        { post_type: 'page', post_name: 'blog' },
      ],
      contract,
    ),
    [],
  );
});
