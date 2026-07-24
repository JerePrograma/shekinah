import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const content = JSON.parse(
  await readFile(new URL('../../src/generated/wordpress-original-content.json', import.meta.url), 'utf8'),
);

const byPath = new Map(content.entries.map((entry) => [entry.path, entry]));
const blockText = (entry) =>
  entry.blocks
    .flatMap((block) => (block.type === 'list' ? block.items : [block.text]))
    .join('\n');

const activeEditorialPaths = [
  '/nosotros/',
  '/tienda/',
  '/blog/',
  '/terms-and-conditions/',
  '/el-viaje-de-las-especias-sabor-y-bienestar/',
  '/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/',
];

const removedEditorialPaths = ['/recetas/', '/chocolate-casero/', '/receta-barra-de-cereal/'];

test('los metadatos internos del contenido son estables', () => {
  assert.equal(
    content.source.archiveSha256,
    '8776c2e6da17a229405e6881ed407760a3c4db3c746b5f67c8c190010013b336',
  );
  assert.equal(content.source.archiveBytes, 515235795);
  assert.match(content.source.wxrSha256, /^[a-f0-9]{64}$/u);
  assert.equal(content.source.capturedDate, '2026-07-20');
});

test('conserva las rutas editoriales activas y retira las recetas', () => {
  assert.equal(content.entries.length, activeEditorialPaths.length);
  for (const path of activeEditorialPaths) {
    assert.ok(byPath.has(path), `Falta la ruta editorial activa ${path}`);
  }
  for (const path of removedEditorialPaths) {
    assert.equal(byPath.has(path), false, `La ruta retirada ${path} sigue en el contenido editorial`);
  }
});

test('conserva los detalles completos de términos y condiciones', () => {
  const terms = blockText(byPath.get('/terms-and-conditions/'));
  assert.match(terms, /Mercado Pago/u);
  assert.match(terms, /10 días corridos/u);
  assert.match(terms, /5 y 15 días hábiles/u);
});

test('mantiene los controles internos de consistencia', () => {
  assert.equal(content.excludedWordPressItems.length, 4);
  assert.equal(content.storeCrossCheck.productsRecovered, 510);
  assert.equal(content.storeCrossCheck.wordpressProductMatches, 0);
  assert.equal(content.storeCrossCheck.productsStillWithoutFullDescription, 15);
  assert.equal(content.storeCrossCheck.productsStillWithoutProductImage, 1);
  assert.doesNotMatch(JSON.stringify(content.entries), /MISSING DESCRIPTION/u);
});
