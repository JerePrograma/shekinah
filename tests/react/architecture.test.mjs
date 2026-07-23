import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('la aplicación usa React y Vite como fuente productiva', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.dependencies.react, '19.2.7');
  assert.equal(pkg.dependencies['react-dom'], '19.2.7');
  assert.match(pkg.scripts.build, /vite build/u);
  assert.match(pkg.scripts.build, /prerender/u);
  assert.doesNotMatch(pkg.scripts.build, /wordpress|snapshot/iu);
  assert.equal(pkg.dependencies.astro, undefined);
});

test('la arquitectura productiva no depende de fuentes heredadas', async () => {
  assert.equal(await exists('reference-snapshot'), false);
  assert.equal(await exists('scripts/wordpress-reference'), false);
  assert.equal(await exists('src/pages/index.astro'), false);
});

test('el contenido y las rutas públicas están declarados en TypeScript', async () => {
  const content = await readFile('src/content.ts', 'utf8');
  for (const route of [
    '/nosotros/',
    '/tienda/',
    '/blog/',
    '/recetas/',
    '/chocolate-casero/',
    '/receta-barra-de-cereal/',
    '/terms-and-conditions/',
  ]) {
    assert.match(content, new RegExp(route.replaceAll('/', '\\/'), 'u'));
  }
});

test('el build produce HTML prerenderizado y SEO técnico', async () => {
  for (const file of [
    'dist/index.html',
    'dist/nosotros/index.html',
    'dist/blog/index.html',
    'dist/recetas/index.html',
    'dist/404.html',
    'dist/sitemap.xml',
    'dist/robots.txt',
  ]) {
    assert.equal(await exists(file), true, `Falta ${file}`);
  }
  const home = await readFile('dist/index.html', 'utf8');
  assert.match(home, /<h1[^>]*>Tesoros botánicos/iu);
  assert.match(home, /rel="canonical" href="https:\/\/jereprograma\.github\.io\/shekinah\/"/u);
  assert.match(home, /application\/ld\+json/u);
  assert.doesNotMatch(home, /Hello world!|trans-[a-z_-]+|wp-admin/iu);
});
