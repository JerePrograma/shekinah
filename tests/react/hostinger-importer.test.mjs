import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  decodeAstro,
  decodeEntities,
  extractAstroIslands,
  importSources,
  normalizeDecodedSources,
  parseAttributes,
  scanStartTags,
} from '../../scripts/import-hostinger-original.mjs';

function encodeProps(value) {
  return JSON.stringify(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

test('decodifica entidades HTML, Unicode y ampersands', () => {
  assert.equal(decodeEntities('&#220;&#x1D106;&lt;árbol&amp;más&gt;'), 'Ü𝄆<árbol&más>');
});

test('preserva props largos, comillas y múltiples islas', () => {
  const firstProps = encodeProps([
    0,
    {
      title: 'Guayaba "verde" & lista',
      id: 'prod_guayaba',
      filler: 'x'.repeat(12_000),
    },
  ]);
  const secondProps = encodeProps([1, ['uno', 'dos']]);
  const html = `<astro-island component-url="/card-1" props="${firstProps}"></astro-island><astro-island props="${secondProps}"></astro-island>`;
  const scanned = scanStartTags(html, 'astro-island');
  assert.equal(scanned.tags.length, 2);
  assert.equal(scanned.errors.length, 0);
  const attributes = parseAttributes(scanned.tags[0].raw);
  assert.equal(attributes.props.length > 12_000, true);
  const extracted = extractAstroIslands(html, 'long.html');
  assert.equal(extracted.islands.length, 2);
  assert.equal(extracted.islands[0].value.title, 'Guayaba "verde" & lista');
});

test('informa JSON inválido, islas sin props y HTML truncado', () => {
  const html = '<astro-island props="{not-json}"></astro-island><astro-island></astro-island><astro-island props="';
  const extracted = extractAstroIslands(html, 'broken.html');
  assert.deepEqual(
    new Set(extracted.errors.map((error) => error.code)),
    new Set(['INVALID_PROPS_JSON', 'MISSING_PROPS', 'TRUNCATED_TAG']),
  );
});

test('decodifica tipos Astro 0 a 11 y preserva tipos desconocidos', () => {
  const value = [
    0,
    {
      array: [1, [[0, { name: 'demo' }], [6, '9007199254740993']]],
      regexp: [2, ['a+', 'i']],
      date: [3, '2026-07-23T00:00:00.000Z'],
      map: [4, [[[0, { k: 'v' }], [7, 'https://example.com/item']]]],
      set: [5, [[6, '42'], 'x']],
      bigInt: [6, '12345678901234567890'],
      url: [7, 'https://example.com/node'],
      uint8: [8, [1, 2, 255]],
      uint16: [9, [1, 65_535]],
      uint32: [10, [1, 4_294_967_295]],
      infinity: [11, 1],
      negativeInfinity: [11, -1],
      unknown: [99, [0, { deep: [1, ['ok']] }]],
    },
  ];
  const decoded = decodeAstro(value);
  assert.equal(decoded.array[0].name, 'demo');
  assert.equal(decoded.array[1], 9007199254740993n);
  assert.ok(decoded.regexp instanceof RegExp);
  assert.ok(decoded.date instanceof Date);
  assert.ok(decoded.map instanceof Map);
  assert.ok(decoded.set instanceof Set);
  assert.equal(decoded.bigInt, 12345678901234567890n);
  assert.equal(decoded.url.href, 'https://example.com/node');
  assert.deepEqual([...decoded.uint8], [1, 2, 255]);
  assert.deepEqual([...decoded.uint16], [1, 65_535]);
  assert.deepEqual([...decoded.uint32], [1, 4_294_967_295]);
  assert.equal(decoded.infinity, Infinity);
  assert.equal(decoded.negativeInfinity, -Infinity);
  assert.deepEqual(decoded.unknown, {
    $type: 'UnknownAstroType',
    tag: 99,
    payload: { deep: ['ok'] },
  });
});

test('normaliza productos, categorías, precios, moneda, unidad, WhatsApp y store ID', () => {
  const decodedSources = [
    {
      sourceFile: 'capture/home.html',
      sha256: 'a'.repeat(64),
      islands: [
        {
          index: 0,
          value: {
            storeID: 'store_01KPB411FQRYAKN8ED2BSRBPZC',
            whatsApp: '542236216559',
            products: [
              {
                id: 'prod_guayaba',
                name: 'Guayaba hojas x 50 gr',
                slug: 'guayaba',
                description: 'Hojas de guayaba.',
                price: { amount: 8999, currency: 'ARS' },
                unit: '50 gr',
                categories: [{ name: 'Hierbas medicinales' }],
                images: [{ url: 'https://cdn.zyrosite.com/guayaba.webp', alt: 'Guayaba' }],
              },
            ],
          },
        },
      ],
      errors: [],
    },
  ];
  const snapshot = normalizeDecodedSources(decodedSources);
  assert.equal(snapshot.products.length, 1);
  assert.equal(snapshot.products[0].id, 'prod_guayaba');
  assert.equal(snapshot.products[0].price, 8999);
  assert.equal(snapshot.products[0].currency, 'ARS');
  assert.equal(snapshot.products[0].unit, '50 gr');
  assert.equal(snapshot.categories[0].name, 'Hierbas medicinales');
  assert.equal(snapshot.storeIds[0], 'store_01KPB411FQRYAKN8ED2BSRBPZC');
  assert.equal(snapshot.phones[0], '542236216559');
});

test('integra varios HTML y produce manifiestos deterministas', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'shekinah-importer-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const outputOne = path.join(root, 'out-one');
  const outputTwo = path.join(root, 'out-two');
  await mkdir(source);

  const fixtures = [
    {
      file: 'b.html',
      product: {
        id: 'prod_b',
        name: 'Beta',
        price: 20,
        currency: 'ARS',
        categories: ['Suplementos'],
      },
    },
    {
      file: 'a.html',
      product: {
        id: 'prod_a',
        name: 'Alfa',
        price: 10,
        currency: 'ARS',
        categories: ['Hierbas'],
      },
    },
  ];

  for (const fixture of fixtures) {
    const props = encodeProps([0, { products: [1, [[0, fixture.product]]] }]);
    await writeFile(path.join(source, fixture.file), `<astro-island props="${props}"></astro-island>`);
  }

  const options = {
    sources: [source],
    assets: path.join(root, 'assets'),
    downloadAssets: false,
  };
  const runOne = await importSources({ ...options, output: outputOne });
  const runTwo = await importSources({ ...options, output: outputTwo });
  assert.equal(runOne.products, 2);
  assert.deepEqual(
    { ...runOne, output: '<normalized>' },
    { ...runTwo, output: '<normalized>' },
  );

  for (const file of [
    'sources.json',
    'decoded-astro.json',
    'products.json',
    'categories.json',
    'routes.json',
    'collisions.json',
    'missing-data.json',
    'fidelity.json',
  ]) {
    const left = await readFile(path.join(outputOne, file), 'utf8');
    const right = await readFile(path.join(outputTwo, file), 'utf8');
    assert.equal(left, right, `${file} no es determinista`);
  }

  const productOutput = JSON.parse(await readFile(path.join(outputOne, 'products.json'), 'utf8'));
  assert.deepEqual(productOutput.map((product) => product.id), ['prod_a', 'prod_b']);
});
