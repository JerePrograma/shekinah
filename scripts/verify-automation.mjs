import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const workflowRoot = join(projectRoot, '.github', 'workflows');
const workflowPath = join(workflowRoot, 'ci.yml');
const nodeVersionPath = join(projectRoot, '.node-version');
const packagePath = join(projectRoot, 'package.json');

const expectedNodeVersion = '24.18.0';
const allowedActions = new Set([
  'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
  'actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
]);

const requiredDocuments = new Map([
  ['README.md', ['# Shekinah', 'npm run verify', 'npm run build:pages']],
  ['docs/PROVENANCE.md', ['# Procedencia', 'cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747']],
  ['docs/AUTHORIZED_ASSETS.md', ['# Activos autorizados', 'public/assets/logo-shekinah.png']],
  ['docs/ARCHITECTURE.md', ['# Arquitectura', 'History API', 'src/data/authorized-commercial-data.ts']],
  ['docs/ACCESSIBILITY.md', ['# Accesibilidad', 'Saltar al contenido', 'prefers-reduced-motion']],
  ['docs/DEPLOYMENT.md', ['# Despliegue', 'npm run build:pages', 'dist', 'main']],
  ['docs/THIRD_PARTY_NOTICES.md', ['# Avisos de terceros', '@playwright/test', 'typescript']],
  ['docs/design/BLOCK_6_AUTOMATION_DEPLOYMENT.md', ['# Automatización y despliegue del BLOQUE 6']],
  ['docs/validation/BLOCK_6_VALIDATION.md', ['# Validación del BLOQUE 6']],
]);

function fail(message) {
  throw new Error(message);
}

function readText(path) {
  if (!existsSync(path)) {
    fail(`No existe: ${relative(projectRoot, path)}`);
  }

  return readFileSync(path, 'utf8');
}

function listFiles(path) {
  if (!existsSync(path)) {
    return [];
  }

  return readdirSync(path)
    .map((entry) => join(path, entry))
    .filter((entryPath) => statSync(entryPath).isFile())
    .map((entryPath) => relative(projectRoot, entryPath).replaceAll('\\', '/'))
    .sort();
}

function verifyNodeVersion() {
  const nodeVersion = readText(nodeVersionPath).trim();

  if (nodeVersion !== expectedNodeVersion) {
    fail(`.node-version debe contener ${expectedNodeVersion}.`);
  }

  const packageJson = JSON.parse(readText(packagePath));

  if (packageJson.engines?.node !== '>=24.0.0' || packageJson.engines?.npm !== '>=11.0.0') {
    fail('Los engines de Node.js y npm no coinciden con la base técnica.');
  }
}

function verifyPackageScripts() {
  const packageJson = JSON.parse(readText(packagePath));
  const scripts = packageJson.scripts ?? {};

  const expectedScripts = {
    'build:pages':
      'npm run lint && npm run typecheck && npm run test && npm run verify:catalog && npm run build && npm run verify:assets && npm run verify:security && npm run verify:automation',
    'verify:catalog': 'node scripts/verify-catalog.mjs',
    'verify:automation': 'node scripts/verify-automation.mjs',
    verify:
      'npm run lint && npm run typecheck && npm run test && npm run verify:catalog && npm run build && npm run verify:assets && npm run verify:security && npm run verify:automation && npm run test:e2e',
  };

  for (const [name, value] of Object.entries(expectedScripts)) {
    if (scripts[name] !== value) {
      fail(`El script ${name} no coincide con el contrato del BLOQUE 6.`);
    }
  }
}

function verifyWorkflow() {
  const workflowFiles = listFiles(workflowRoot);

  if (
    workflowFiles.length !== 1 ||
    workflowFiles[0] !== '.github/workflows/ci.yml'
  ) {
    fail('Debe existir únicamente .github/workflows/ci.yml.');
  }

  const workflow = readText(workflowPath);

  const requiredFragments = [
    'name: CI',
    'push:',
    'branches:',
    '- main',
    'pull_request:',
    'workflow_dispatch:',
    'permissions:',
    'contents: read',
    'group: ci-${{ github.workflow }}-${{ github.ref }}',
    'cancel-in-progress: true',
    'runs-on: ubuntu-latest',
    'timeout-minutes: 20',
    'persist-credentials: false',
    'node-version-file: .node-version',
    'cache: npm',
    'cache-dependency-path: package-lock.json',
    'run: npm ci',
    'run: npx playwright install --with-deps chromium',
    'run: npm run verify',
    'if: success()',
    'name: shekinah-dist-${{ github.sha }}',
    'path: dist',
    'if-no-files-found: error',
    'retention-days: 7',
    'include-hidden-files: true',
  ];

  for (const fragment of requiredFragments) {
    if (!workflow.includes(fragment)) {
      fail(`Falta el fragmento requerido en CI: ${fragment}`);
    }
  }

  const actionReferences = [
    ...workflow.matchAll(/^\s*uses:\s*([^\s#]+).*$/gmu),
  ].map((match) => match[1]);

  if (actionReferences.length !== allowedActions.size) {
    fail('La cantidad de acciones usadas no coincide con la lista permitida.');
  }

  for (const actionReference of actionReferences) {
    if (!allowedActions.has(actionReference)) {
      fail(`Acción no autorizada o no fijada a SHA: ${actionReference}`);
    }
  }

  for (const allowedAction of allowedActions) {
    if (!actionReferences.includes(allowedAction)) {
      fail(`No se utiliza la acción requerida: ${allowedAction}`);
    }
  }

  const forbiddenPatterns = [
    { label: 'permiso de escritura', pattern: /\bwrite\b/iu },
    { label: 'pull_request_target', pattern: /pull_request_target/iu },
    { label: 'referencia a secrets', pattern: /\bsecrets\./iu },
    { label: 'Wrangler', pattern: /\bwrangler\b/iu },
    { label: 'Cloudflare Action', pattern: /cloudflare\//iu },
    { label: 'curl', pattern: /\bcurl\b/iu },
    { label: 'wget', pattern: /\bwget\b/iu },
    { label: 'PowerShell', pattern: /\b(?:powershell|pwsh|Invoke-WebRequest)\b/iu },
    { label: 'payload codificado', pattern: /\b(?:base64|fromJSON)\b/iu },
    { label: 'github-script', pattern: /github-script/iu },
    { label: 'repository_dispatch', pattern: /repository_dispatch/iu },
  ];

  for (const forbidden of forbiddenPatterns) {
    if (forbidden.pattern.test(workflow)) {
      fail(`Contenido prohibido en CI: ${forbidden.label}.`);
    }
  }

  const checkoutIndex = workflow.indexOf('actions/checkout@');
  const setupIndex = workflow.indexOf('actions/setup-node@');
  const installIndex = workflow.indexOf('run: npm ci');
  const verifyIndex = workflow.indexOf('run: npm run verify');
  const uploadIndex = workflow.indexOf('actions/upload-artifact@');

  if (
    !(
      checkoutIndex < setupIndex &&
      setupIndex < installIndex &&
      installIndex < verifyIndex &&
      verifyIndex < uploadIndex
    )
  ) {
    fail('El orden de pasos del workflow no es el esperado.');
  }
}

function verifyDocuments() {
  for (const [relativePath, fragments] of requiredDocuments) {
    const content = readText(join(projectRoot, relativePath));

    for (const fragment of fragments) {
      if (!content.includes(fragment)) {
        fail(`Falta contenido requerido en ${relativePath}: ${fragment}`);
      }
    }
  }

  const packageJson = JSON.parse(readText(packagePath));
  const directPackages = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ];

  const notices = readText(
    join(projectRoot, 'docs', 'THIRD_PARTY_NOTICES.md'),
  );

  for (const packageName of directPackages) {
    if (!notices.includes(`\`${packageName}\``)) {
      fail(`Falta ${packageName} en THIRD_PARTY_NOTICES.md.`);
    }
  }

  const deployment = readText(join(projectRoot, 'docs', 'DEPLOYMENT.md'));

  const requiredDeploymentFragments = [
    'Rama de producción: `main`',
    'Comando de build: `npm run build:pages`',
    'Directorio de salida: `dist`',
    'Versión de Node.js: `24.18.0`',
    'La conexión y el estado del despliegue deben verificarse',
  ];

  for (const fragment of requiredDeploymentFragments) {
    if (!deployment.includes(fragment)) {
      fail(`Falta configuración de despliegue: ${fragment}`);
    }
  }

  const forbiddenDeploymentClaims = [
    'despliegue confirmado',
    'producción verificada',
    'Cloudflare conectado y operativo',
  ];

  for (const claim of forbiddenDeploymentClaims) {
    if (deployment.toLocaleLowerCase('es').includes(claim.toLocaleLowerCase('es'))) {
      fail(`La documentación afirma un estado no verificado: ${claim}`);
    }
  }
}

verifyNodeVersion();
verifyPackageScripts();
verifyWorkflow();
verifyDocuments();

console.log(
  'Automatización verificada: Node.js, workflow CI, permisos, acciones, scripts y documentación.',
);
