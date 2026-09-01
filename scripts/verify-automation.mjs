import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const workflowRoot = join(root, '.github', 'workflows');
const expectedNodeVersion = '24.18.0';
const allowedActions = new Set([
  'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
  'actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
]);
const requiredDocuments = new Map([
  ['README.md', ['# Shekinah', 'npm run verify', 'npm run build:pages', 'COMMERCE_ENABLED=false']],
  ['docs/PROVENANCE.md', ['# Procedencia']],
  ['docs/AUTHORIZED_ASSETS.md', ['# Activos autorizados', 'public/assets/logo-shekinah.png']],
  ['docs/ARCHITECTURE.md', ['# Arquitectura', 'History API', 'src/data/authorized-commercial-data.ts']],
  ['docs/ACCESSIBILITY.md', ['# Accesibilidad', 'Saltar al contenido', 'prefers-reduced-motion']],
  ['docs/DEPLOYMENT.md', ['# Despliegue', 'npm run build:pages', 'dist', 'main']],
  ['docs/THIRD_PARTY_NOTICES.md', ['# Avisos de terceros']],
  ['docs/FULL_STACK_COMMERCE.md', ['# Comercio full-stack', 'Cloudflare Pages Functions']],
  ['docs/FULFILLMENT_AND_RETENTION.md', ['# Fulfillment, envío y retención', '0003_checkout_intent_cart_fingerprint.sql']],
  ['docs/COMMERCE_DEPLOYMENT.md', ['# Despliegue del comercio', 'COMMERCE_ENABLED']],
  ['docs/COMMERCE_OPERATIONS.md', ['# Operación del comercio']],
  ['docs/COMMERCE_INCIDENTS_AND_ROLLBACK.md', ['# Incidentes y rollback']],
  ['docs/CODEX_AUTORREFERENCIA.md', ['# Shekinah — Autorreferencia operativa de Codex', '## 22. Historial de sesiones']],
]);

function fail(message) { throw new Error(message); }
function read(path) {
  if (!existsSync(path)) fail(`No existe: ${relative(root, path)}`);
  return readFileSync(path, 'utf8');
}
function listFiles(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .map((entry) => join(path, entry))
    .filter((entry) => statSync(entry).isFile())
    .map((entry) => relative(root, entry).replaceAll('\\', '/'))
    .sort();
}

const nodeVersion = read(join(root, '.node-version')).trim();
if (nodeVersion !== expectedNodeVersion) fail(`.node-version debe contener ${expectedNodeVersion}.`);
const packageJson = JSON.parse(read(join(root, 'package.json')));
if (packageJson.engines?.node !== '>=24.0.0' || packageJson.engines?.npm !== '>=11.0.0') {
  fail('Los engines no coinciden con la base técnica.');
}
const expectedScripts = {
  'build:pages': 'npm run lint && npm run typecheck && npm run test && npm run verify:catalog && npm run verify:commerce-catalog && npm run verify:shipping-weights && npm run build && npm run verify:assets && npm run verify:security && npm run verify:automation',
  'verify:catalog': 'node scripts/verify-catalog.mjs',
  'generate:commerce-catalog': 'node scripts/generate-commerce-catalog.mjs',
  'verify:commerce-catalog': 'node scripts/verify-commerce-catalog.mjs',
  'verify:shipping-weights': 'node scripts/verify-shipping-weights.mjs',
  'verify:automation': 'node scripts/verify-automation.mjs',
  verify: 'npm run lint && npm run typecheck && npm run test && npm run verify:catalog && npm run verify:commerce-catalog && npm run verify:shipping-weights && npm run build && npm run verify:assets && npm run verify:security && npm run verify:automation && npm run test:e2e',
};
for (const [name, value] of Object.entries(expectedScripts)) {
  if (packageJson.scripts?.[name] !== value) fail(`El script ${name} no coincide con el contrato actual.`);
}

const workflowFiles = listFiles(workflowRoot);
if (JSON.stringify(workflowFiles) !== JSON.stringify([
  '.github/workflows/ci.yml',
  '.github/workflows/dux-reconcile.yml',
])) {
  fail('Sólo están autorizados CI y la reconciliación read-only de Dux.');
}
for (const workflowFile of workflowFiles) {
  const content = read(join(root, workflowFile));
  if (/run-mercadolibre-reconcile|\/mercadolibre\/reconcile|MERCADO_LIBRE_SCHEDULER_SECRET/iu.test(content)) {
    fail(`El workflow ${workflowFile} no puede ejecutar la reconciliación directa de Mercado Libre.`);
  }
}
const workflow = read(join(root, '.github', 'workflows', 'ci.yml'));
for (const fragment of [
  'name: CI', 'push:', '- main', 'pull_request:', 'workflow_dispatch:',
  'contents: read', 'persist-credentials: false', 'node-version-file: .node-version',
  'run: npm ci', 'run: npm run verify', 'name: shekinah-dist-${{ github.sha }}',
  'path: dist', 'if-no-files-found: error',
]) {
  if (!workflow.includes(fragment)) fail(`Falta el fragmento requerido en CI: ${fragment}`);
}
const actionReferences = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+).*$/gmu)].map((match) => match[1]);
if (actionReferences.length !== allowedActions.size) fail('La cantidad de acciones de CI no coincide.');
for (const action of actionReferences) {
  if (action === undefined || !allowedActions.has(action)) fail(`Acción no autorizada o no fijada a SHA: ${action}`);
}
for (const forbidden of [
  /\bwrite\b/iu, /pull_request_target/iu, /\bsecrets\./iu, /cloudflare\//iu,
  /\bcurl\b/iu, /\bwget\b/iu, /\b(?:powershell|pwsh|Invoke-WebRequest)\b/iu,
  /github-script/iu, /repository_dispatch/iu,
]) {
  if (forbidden.test(workflow)) fail(`Contenido prohibido en CI: ${forbidden}`);
}

const reconciliationWorkflow = read(join(root, '.github', 'workflows', 'dux-reconcile.yml'));
for (const fragment of [
  'name: Dux inventory reconciliation', "cron: '7,22,37,52 * * * *'", 'workflow_dispatch:',
  'contents: read', 'cancel-in-progress: false', 'timeout-minutes: 20',
  "if: ${{ vars.DUX_RECONCILIATION_ENABLED == 'true' }}",
  'name: cloudflare-pages-production', 'deployment: false', 'persist-credentials: false',
  'node-version-file: .node-version',
  'SHEKINAH_RECONCILE_URL: https://shekinah.ar/api/internal/dux/reconcile',
  'SHEKINAH_RECONCILE_SECRET: ${{ secrets.DUX_SCHEDULER_SECRET }}',
  'run: node scripts/run-dux-reconcile.mjs',
]) {
  if (!reconciliationWorkflow.includes(fragment)) {
    fail(`Falta el fragmento requerido en la reconciliación: ${fragment}`);
  }
}
if (/mercado\s*libre|mercadolibre|MERCADO_LIBRE/iu.test(reconciliationWorkflow)) {
  fail('El scheduler de producción no puede invocar ni configurar Mercado Libre.');
}
const reconciliationActions = [
  ...reconciliationWorkflow.matchAll(/^\s*uses:\s*([^\s#]+).*$/gmu),
].map((match) => match[1]);
if (reconciliationActions.length !== 2) fail('La cantidad de acciones del scheduler no coincide.');
for (const action of reconciliationActions) {
  if (action === undefined || !allowedActions.has(action)) {
    fail(`Acción no autorizada o no fijada a SHA en el scheduler: ${action}`);
  }
}

const duxRunner = read(join(root, 'scripts', 'run-dux-reconcile.mjs'));
for (const fragment of [
  "const expectedPath = '/api/internal/dux/reconcile'",
  "errorCode(payload) === 'DUX_SYNC_IN_PROGRESS'",
  "errorCode(payload) === 'DUX_SYNC_COOLDOWN'",
  'protectedOverlap && attempt === 1 && lastError === undefined',
  "value.status === 'disabled'",
  "value.status !== 'completed'",
]) {
  if (!duxRunner.includes(fragment)) fail(`Falta el contrato requerido en el runner Dux: ${fragment}`);
}
for (const forbidden of [
  /pull_request_target/iu, /\bcurl\b/iu, /\bwget\b/iu,
  /\b(?:powershell|pwsh|Invoke-WebRequest)\b/iu, /cloudflare\//iu,
  /github-script/iu, /repository_dispatch/iu,
]) {
  if (forbidden.test(reconciliationWorkflow)) {
    fail(`Contenido prohibido en el scheduler: ${forbidden}`);
  }
}

for (const [relativePath, fragments] of requiredDocuments) {
  const content = read(join(root, relativePath));
  for (const fragment of fragments) {
    if (!content.includes(fragment)) fail(`Falta contenido requerido en ${relativePath}: ${fragment}`);
  }
}
const notices = read(join(root, 'docs', 'THIRD_PARTY_NOTICES.md'));
for (const packageName of [...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.devDependencies ?? {})]) {
  if (!notices.includes(`\`${packageName}\``)) fail(`Falta ${packageName} en THIRD_PARTY_NOTICES.md.`);
}
const deployment = read(join(root, 'docs', 'DEPLOYMENT.md'));
for (const fragment of [
  'Rama de producción: `main`',
  'Comando de build: `npm run build:pages`',
  'Directorio de salida: `dist`',
  'Versión de Node.js: `24.18.0`',
]) {
  if (!deployment.includes(fragment)) fail(`Falta configuración de despliegue: ${fragment}`);
}
for (const claim of ['despliegue confirmado', 'producción verificada', 'Cloudflare conectado y operativo']) {
  if (deployment.toLocaleLowerCase('es').includes(claim)) fail(`La documentación afirma un estado no verificado: ${claim}`);
}

const gitignore = read(join(root, '.gitignore'));
if (!gitignore.split(/\r?\n/u).includes('server/generated/catalog.json')) {
  fail('El catálogo generado de Functions debe permanecer fuera de Git.');
}
const routes = JSON.parse(read(join(root, 'public', '_routes.json')));
if (JSON.stringify(routes) !== JSON.stringify({ version: 1, include: ['/api/*', '/admin', '/admin/*'], exclude: ['/assets/*', '/images/*'] })) {
  fail('public/_routes.json no coincide con las rutas serverless autorizadas.');
}

console.log('Automatización verificada: Node.js, CI, acciones fijadas, catálogo generado, rutas y documentación.');
