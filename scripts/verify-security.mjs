import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

await import('./verify-security-core.mjs');

const projectRoot = resolve(import.meta.dirname, '..');
const distRoot = join(projectRoot, 'dist');
const publicIndexPath = join(
  projectRoot,
  'src',
  'catalog-data',
  'catalog-index.json',
);
const internalIndexPath = join(
  projectRoot,
  'catalog',
  'internal',
  'catalog-index.json',
);
const forbiddenCopy = [
  '/enfoque',
  'Enfoque | Shekinah',
  'Información comercial capturada',
  'catálogo comercial recuperado',
  'Precio registrado',
  'Precio promocional registrado',
  'Disponibilidad registrada',
  'Datos comerciales capturados',
  'Variantes registradas',
  'Ver el enfoque',
];

function listFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

function fail(message) {
  throw new Error(message);
}

function verifyText(paths, label) {
  for (const path of paths) {
    const content = readFileSync(path, 'utf8');
    for (const phrase of forbiddenCopy) {
      if (content.toLocaleLowerCase('es').includes(phrase.toLocaleLowerCase('es'))) {
        fail(`${label} contiene copy retirado en ${relative(projectRoot, path)}: ${phrase}`);
      }
    }
    if (/"capturedAt"\s*:/u.test(content)) {
      fail(`${label} contiene el campo interno capturedAt en ${relative(projectRoot, path)}.`);
    }
  }
}

if (existsSync(publicIndexPath) || !existsSync(internalIndexPath)) {
  fail('El índice del catálogo no está separado correctamente.');
}

const sourceFiles = [join(projectRoot, 'index.html')]
  .concat(listFiles(join(projectRoot, 'src')))
  .concat(listFiles(join(projectRoot, 'public')))
  .filter((path) => {
    const relativePath = relative(projectRoot, path).replaceAll('\\', '/');
    return (
      ['.ts', '.tsx', '.css', '.html', '.json'].includes(extname(path)) &&
      !relativePath.includes('/test/') &&
      !/\.test\.(?:ts|tsx)$/u.test(relativePath)
    );
  });
verifyText(sourceFiles, 'El producto público');

const distFiles = listFiles(distRoot).filter((path) =>
  ['.js', '.css', '.html', '.json', '.txt'].includes(extname(path)),
);
verifyText(distFiles, 'dist');

console.log(
  'Copy comercial verificado: sin ruta retirada, avisos anteriores ni metadatos internos en dist.',
);
