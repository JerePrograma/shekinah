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
const credentialPatterns = [
  /\bAPP_USR-[A-Za-z0-9_-]{20,}\b/u,
  /\bTEST-[A-Za-z0-9_-]{20,}\b/u,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{16,}\b/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bpbkdf2-sha256\$[1-9][0-9]{5,6}\$[A-Za-z0-9_-]{22,86}\$[A-Za-z0-9_-]{43}\b/u,
];
const requiredFunctions = [
  'functions/admin.ts',
  'functions/api/checkout/preferences.ts',
  'functions/api/webhooks/mercadopago.ts',
  'functions/api/orders/[publicToken]/status.ts',
  'functions/api/analytics/events.ts',
  'functions/api/privacy/delete-session.ts',
  'functions/api/catalog.ts',
  'functions/api/catalog/[id].ts',
  'functions/api/admin/_middleware.ts',
  'functions/api/admin/auth/login.ts',
  'functions/api/admin/auth/session.ts',
  'functions/api/admin/auth/logout.ts',
  'functions/api/admin/products.ts',
  'functions/api/admin/products/[id].ts',
  'functions/api/admin/summary.ts',
  'functions/api/admin/orders.ts',
  'functions/api/admin/orders/[id].ts',
  'functions/api/admin/analytics/funnel.ts',
  'functions/api/admin/analytics/products.ts',
  'functions/api/admin/analytics/sources.ts',
  'functions/api/admin/analytics/devices.ts',
  'functions/api/admin/analytics/trend.ts',
  'functions/api/admin/audit.ts',
  'functions/api/admin/exports/orders.csv.ts',
  'functions/api/admin/exports/analytics.csv.ts',
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

function verifyCredentials(paths) {
  for (const path of paths) {
    const content = readFileSync(path, 'utf8');
    for (const pattern of credentialPatterns) {
      if (pattern.test(content)) {
        fail(`Se detectó una credencial potencial en ${relative(projectRoot, path)}.`);
      }
    }
  }
}

if (existsSync(publicIndexPath) || !existsSync(internalIndexPath)) {
  fail('El índice del catálogo no está separado correctamente.');
}

const publicSourceFiles = [join(projectRoot, 'index.html')]
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
verifyText(publicSourceFiles, 'El producto público');

const protectedSourceFiles = []
  .concat(listFiles(join(projectRoot, 'server')))
  .concat(listFiles(join(projectRoot, 'functions')))
  .concat(listFiles(join(projectRoot, 'migrations')))
  .filter((path) => ['.ts', '.sql'].includes(extname(path)));
verifyCredentials(publicSourceFiles.concat(protectedSourceFiles));

for (const relativePath of requiredFunctions) {
  if (!existsSync(join(projectRoot, relativePath))) {
    fail(`Falta la Function requerida: ${relativePath}.`);
  }
}
if (!existsSync(join(projectRoot, 'migrations', '0001_commerce.sql'))) {
  fail('Falta la migración inicial de comercio.');
}
if (!existsSync(join(projectRoot, 'migrations', '0004_catalog_admin.sql'))) {
  fail('Falta la migración aditiva del catálogo administrativo.');
}
if (!existsSync(join(projectRoot, 'migrations', '0005_admin_auth.sql'))) {
  fail('Falta la migración de protección del login administrativo.');
}

const headers = readFileSync(join(projectRoot, 'public', '_headers'), 'utf8');
if (!headers.includes("connect-src 'self'")) {
  fail("La CSP debe permitir únicamente conexiones first-party mediante connect-src 'self'.");
}

const distFiles = listFiles(distRoot);
if (distFiles.some((path) => extname(path) === '.map')) {
  fail('dist contiene source maps de producción.');
}
const inspectableDistFiles = distFiles.filter((path) =>
  ['.js', '.css', '.html', '.json', '.txt'].includes(extname(path)),
);
verifyText(inspectableDistFiles, 'dist');
verifyCredentials(inspectableDistFiles);
for (const path of inspectableDistFiles) {
  if (/sourceMappingURL\s*=/u.test(readFileSync(path, 'utf8'))) {
    fail(`dist referencia un source map en ${relative(projectRoot, path)}.`);
  }
}

console.log(
  'Seguridad verificada: copy vigente, Functions completas, sin credenciales ni source maps y CSP first-party.',
);
