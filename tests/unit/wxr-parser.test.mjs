import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseWxr } from '../../scripts/migration/lib/wxr-parser.mjs';

test('analiza WXR saneado y conserva contenido CDATA', async () => {
  const xml = await readFile(new URL('../fixtures/sample-wxr.xml', import.meta.url), 'utf8');
  const parsed = parseWxr(xml);

  assert.equal(parsed.title, 'Ejemplo saneado');
  assert.equal(parsed.language, 'es-AR');
  assert.equal(parsed.wxrVersion, '1.2');
  assert.equal(parsed.items.length, 1);
  assert.deepEqual(parsed.items[0], {
    id: 42,
    title: 'Página de prueba',
    link: '',
    creator: '',
    content: '<p>Contenido & evidencia</p>',
    excerpt: '',
    date: '2026-01-02 03:04:05',
    modified: '2026-01-03 03:04:05',
    slug: 'pagina-de-prueba',
    status: 'publish',
    parent: 0,
    type: 'page',
    attachmentUrl: '',
    categories: [],
    meta: [{ key: '_wp_page_template', value: 'default' }],
  });
});
