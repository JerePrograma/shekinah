import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const removedPaths = ['/recetas/', '/chocolate-casero/', '/receta-barra-de-cereal/'];

test('el contenido retirado no forma parte de las fuentes públicas', async () => {
  const source = JSON.parse(await readFile('src/generated/wordpress-original-content.json', 'utf8'));
  const publicEditorial = JSON.parse(await readFile('src/generated-public/editorial.json', 'utf8'));
  const sourcePaths = new Set(source.entries.map((entry) => entry.path));
  const sourceIndexPaths = new Set(source.sourceIndex.map((entry) => entry.path));
  const publicPaths = new Set(publicEditorial.entries.map((entry) => entry.path));

  for (const path of removedPaths) {
    assert.equal(sourcePaths.has(path), false, `${path} permanece en la fuente editorial`);
    assert.equal(sourceIndexPaths.has(path), false, `${path} permanece en el índice editorial`);
    assert.equal(publicPaths.has(path), false, `${path} permanece en la proyección pública`);
  }
});

test('las rutas retiradas redirigen permanentemente y no aparecen en el sitemap', async () => {
  const redirects = await readFile('dist/_redirects', 'utf8');
  const sitemap = await readFile('dist/sitemap.xml', 'utf8');
  for (const path of removedPaths) {
    assert.match(redirects, new RegExp(`^${path} /tienda/ 301$`, 'mu'));
    assert.doesNotMatch(sitemap, new RegExp(path, 'u'));
  }
});

test('la navegación visible no ofrece destinos retirados', async () => {
  const content = await readFile('src/content.ts', 'utf8');
  const app = await readFile('src/App.tsx', 'utf8');
  const storeShell = await readFile('src/storeShell.tsx', 'utf8');
  assert.doesNotMatch(content.match(/export const navigation = \[[\s\S]*?\] as const;/u)?.[0] ?? '', /receta/iu);
  assert.doesNotMatch(app, />\s*Recetas?\s*</iu);
  assert.doesNotMatch(storeShell, />\s*Recetas?\s*</iu);
});

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(filePath)));
    else files.push(filePath.replaceAll(path.sep, '/'));
  }
  return files;
}

async function findUnexpectedReferences() {
  const roots = ['src', 'scripts', 'tests', 'docs', '.github'];
  const allowlist = new Set([
    'src/content.ts',
    'scripts/prepare-public-data.mjs',
    'tests/react/editorial-content.test.mjs',
    'tests/react/removed-content.test.mjs',
    'tests/react-e2e/site.spec.ts',
    'docs/CONTENT-INVENTORY.md',
    'docs/ROUTE-MAP.md',
    '.github/workflows/deploy-cloudflare.yml',
  ]);
  const extensions = new Set(['.css', '.json', '.md', '.mjs', '.ts', '.tsx', '.yml', '.yaml']);
  const files = (await Promise.all(roots.map(walk))).flat();
  const findings = [];
  for (const file of files) {
    if (allowlist.has(file) || !extensions.has(path.extname(file))) continue;
    if (/generated(?:-public)?\/(?:products|categories)\.json$/u.test(file)) continue;
    const content = await readFile(file, 'utf8');
    for (const removedPath of removedPaths) {
      if (content.includes(removedPath)) findings.push(`${file}: ${removedPath}`);
    }
  }
  return findings;
}

const unexpectedReferences = await findUnexpectedReferences();
const referenceTestName = unexpectedReferences[0]
  ? `referencia residual: ${unexpectedReferences[0]}`
  : 'las referencias técnicas necesarias quedan limitadas a redirecciones y pruebas';

test(referenceTestName, () => {
  assert.deepEqual(unexpectedReferences, []);
});
