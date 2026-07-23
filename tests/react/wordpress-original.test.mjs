import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const recovered = JSON.parse(
  await readFile(new URL('../../src/generated/wordpress-original-content.json', import.meta.url), 'utf8'),
);

const byPath = new Map(recovered.entries.map((entry) => [entry.path, entry]));
const blockText = (entry) =>
  entry.blocks
    .flatMap((block) => (block.type === 'list' ? block.items : [block.text]))
    .join('\n');

test('la extracción WordPress original queda identificada por hashes estables', () => {
  assert.equal(
    recovered.source.archiveSha256,
    '8776c2e6da17a229405e6881ed407760a3c4db3c746b5f67c8c190010013b336',
  );
  assert.equal(recovered.source.archiveBytes, 515235795);
  assert.match(recovered.source.wxrSha256, /^[a-f0-9]{64}$/u);
  assert.equal(recovered.source.capturedDate, '2026-07-20');
});

test('conserva todas las rutas editoriales comerciales publicadas', () => {
  assert.equal(recovered.entries.length, 9);
  for (const path of [
    '/nosotros/',
    '/tienda/',
    '/blog/',
    '/recetas/',
    '/chocolate-casero/',
    '/receta-barra-de-cereal/',
    '/terms-and-conditions/',
    '/el-viaje-de-las-especias-sabor-y-bienestar/',
    '/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/',
  ]) {
    assert.ok(byPath.has(path), `Falta la ruta recuperada ${path}`);
  }
});

test('restaura los detalles completos que faltaban en recetas y términos', () => {
  const chocolate = blockText(byPath.get('/chocolate-casero/'));
  assert.match(chocolate, /flor de oropel/iu);
  assert.match(chocolate, /Guía para Principiantes: Tu Primer Chocolate Artesanal/u);
  assert.match(chocolate, /¿Por qué tengo que guardarlo en la heladera\?/u);

  const cereal = blockText(byPath.get('/receta-barra-de-cereal/'));
  assert.match(cereal, /hasta dos semanas/u);
  assert.match(cereal, /100% veganas/u);

  const terms = blockText(byPath.get('/terms-and-conditions/'));
  assert.match(terms, /Mercado Pago/u);
  assert.match(terms, /10 días corridos/u);
  assert.match(terms, /5 y 15 días hábiles/u);
});

test('documenta residuos de WordPress y faltantes reales sin inventarlos', () => {
  assert.equal(recovered.excludedWordPressItems.length, 4);
  assert.equal(recovered.storeCrossCheck.productsRecovered, 510);
  assert.equal(recovered.storeCrossCheck.wordpressProductMatches, 0);
  assert.equal(recovered.storeCrossCheck.productsStillWithoutFullDescription, 15);
  assert.equal(recovered.storeCrossCheck.productsStillWithoutProductImage, 1);
  assert.doesNotMatch(JSON.stringify(recovered.entries), /MISSING DESCRIPTION/u);
});
