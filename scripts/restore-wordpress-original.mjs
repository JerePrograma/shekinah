#!/usr/bin/env node
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const payloadParts = [
  'scripts/data/wordpress-original-payload/part-00.txt',
  'scripts/data/wordpress-original-payload/part-01.txt',
  'scripts/data/wordpress-original-payload/part-02.txt',
  'scripts/data/wordpress-original-payload/part-03.txt',
];
const payload = (
  await Promise.all(payloadParts.map((file) => readFile(file, 'utf8')))
).join('').replace(/\s+/gu, '');
const files = JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'));
const expectedArchiveSha256 = '8776c2e6da17a229405e6881ed407760a3c4db3c746b5f67c8c190010013b336';
const expectedPaths = [
  'docs/fidelity/wordpress-original-manifest.json',
  'src/content.ts',
  'src/generated/wordpress-original-content.json',
  'tests/react/wordpress-original.test.mjs',
];

const canonicalRoutesSource = `export const canonicalRoutes: string[] = [
  ...new Set([
    '/',
    '/nosotros/',
    '/tienda/',
    '/blog/',
    '/recetas/',
    ...entries.map((entry) => entry.path),
    '/terms-and-conditions/',
    '/category/uncategorized/',
  ]),
];`;
const canonicalRoutesReplacement = `const editorialRoutes = [
  '/nosotros/',
  '/el-viaje-de-las-especias-sabor-y-bienestar/',
  '/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/',
  '/chocolate-casero/',
  '/receta-barra-de-cereal/',
  '/terms-and-conditions/',
] as const;

export const canonicalRoutes: string[] = [
  ...new Set([
    '/',
    '/tienda/',
    '/blog/',
    '/recetas/',
    ...editorialRoutes,
    ...entries.map((entry) => entry.path),
    '/category/uncategorized/',
  ]),
];`;
const contentSource = files['src/content.ts'];
if (typeof contentSource !== 'string' || !contentSource.includes(canonicalRoutesSource)) {
  throw new Error('No se encontró el contrato de rutas editoriales esperado.');
}
files['src/content.ts'] = contentSource.replace(canonicalRoutesSource, canonicalRoutesReplacement);

const testSource = files['tests/react/wordpress-original.test.mjs'];
const testMarkers = [
  ['assert.match(chocolate, /Flor de Oropel/u);', 'assert.match(chocolate, /flor de oropel/iu);'],
  [
    'assert.match(chocolate, /El Paso a Paso a Prueba de Fallos/u);',
    'assert.match(chocolate, /Guía para Principiantes: Tu Primer Chocolate Artesanal/u);',
  ],
];
if (typeof testSource !== 'string') throw new Error('La prueba editorial recuperada no es texto.');
let correctedTest = testSource;
for (const [source, replacement] of testMarkers) {
  if (!correctedTest.includes(source)) throw new Error(`No se encontró la aserción editorial esperada: ${source}`);
  correctedTest = correctedTest.replace(source, replacement);
}
files['tests/react/wordpress-original.test.mjs'] = correctedTest;

const publicEvidencePath = 'src/generated/wordpress-original-content.json';
const publicEvidence = JSON.parse(files[publicEvidencePath]);
publicEvidence.source.wxrFile = 'WordPress-export-2026-07-20.xml';
publicEvidence.sourceIndex = publicEvidence.sourceIndex.map((item) =>
  Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'sourceUrl')),
);
files[publicEvidencePath] = `${JSON.stringify(publicEvidence, null, 2)}\n`;

for (const file of Object.keys(files).sort()) {
  if (!expectedPaths.includes(file)) throw new Error(`Ruta no autorizada en la restauración: ${file}`);
  const target = path.resolve(file);
  if (!target.startsWith(`${process.cwd()}${path.sep}`)) throw new Error(`Ruta fuera del repositorio: ${file}`);
  await mkdir(path.dirname(target), { recursive: true });
  const content = files[file];
  if (typeof content !== 'string' || !content.endsWith('\n')) throw new Error(`Contenido inválido: ${file}`);
  await writeFile(target, content, 'utf8');
}

const recovered = JSON.parse(files[publicEvidencePath]);
if (recovered.source.archiveSha256 !== expectedArchiveSha256) throw new Error('Hash de extracción WordPress inesperado.');
if (recovered.entries.length !== 9) throw new Error(`Cantidad editorial inesperada: ${recovered.entries.length}.`);
if (recovered.attachments.originalFilesPresent !== 20) throw new Error('No se acreditaron los 20 adjuntos originales.');
if (recovered.storeCrossCheck.productsRecovered !== 510) throw new Error('El cruce con el catálogo completo dejó de ser consistente.');
if (recovered.storeCrossCheck.wordpressProductMatches !== 0) throw new Error('Se detectó una coincidencia de producto no revisada.');

process.stdout.write(`${JSON.stringify({
  archiveSha256: recovered.source.archiveSha256,
  editorialEntries: recovered.entries.length,
  originalAttachments: recovered.attachments.originalFilesPresent,
  catalogProductsCrossChecked: recovered.storeCrossCheck.productsRecovered,
  unresolvedDescriptions: recovered.storeCrossCheck.productsStillWithoutFullDescription,
  unresolvedProductImages: recovered.storeCrossCheck.productsStillWithoutProductImage,
}, null, 2)}\n`);
