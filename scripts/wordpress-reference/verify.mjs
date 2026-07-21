#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const required = process.argv.includes('--required');
const snapshotBase = path.resolve('reference-snapshot');
const snapshotRoot = path.join(snapshotBase, 'site');
const manifestPath = path.join(snapshotBase, 'manifest.json');
const expectedProductionOrigin = new URL(
  process.env.SITE_URL ?? 'https://shekinah-7dl.pages.dev',
).origin;
const requiredDataFiles = [
  'categories.json',
  'navigation.json',
  'plugins.json',
  'public-settings.json',
  'published-content.json',
  'tags.json',
  'themes.json',
];
const maxAssetBytes = 25 * 1024 * 1024;
const maxFiles = 20_000;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  if (!(await exists(directory))) return [];
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

function sha256(body) {
  return createHash('sha256').update(body).digest('hex');
}

function failMissingSnapshot() {
  const message =
    'Falta el snapshot WordPress obligatorio: no existe reference-snapshot/site/index.html. Ejecute scripts/Run-FullMigration.ps1 contra la restauración local y publique el resultado.';
  if (required) {
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write('Snapshot WordPress todavía no generado; verificación opcional omitida.\n');
  }
}

if (!(await exists(path.join(snapshotRoot, 'index.html')))) {
  failMissingSnapshot();
} else {
  const errors = [];
  if (!(await exists(manifestPath))) errors.push('falta reference-snapshot/manifest.json');

  let manifest;
  if (errors.length === 0) {
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      errors.push(`manifest.json no es JSON válido: ${error.message}`);
    }
  }

  if (manifest) {
    if (manifest.schemaVersion !== 2) errors.push('schemaVersion debe ser 2');
    if (manifest.productionOrigin !== expectedProductionOrigin) {
      errors.push(
        `productionOrigin inválido: ${manifest.productionOrigin}; esperado ${expectedProductionOrigin}`,
      );
    }
    if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
      errors.push('el manifiesto no contiene páginas');
    }
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      errors.push('el manifiesto no contiene archivos del sitio');
    }
    if (!Array.isArray(manifest.snapshotFiles) || manifest.snapshotFiles.length === 0) {
      errors.push('el manifiesto no contiene archivos auxiliares de data/screenshots');
    }
    if ((manifest.httpErrors?.length ?? 0) > 0) {
      errors.push(`el manifiesto registra ${manifest.httpErrors.length} errores HTTP`);
    }
    if ((manifest.unrecoverablePages?.length ?? 0) > 0) {
      errors.push(
        `el manifiesto registra ${manifest.unrecoverablePages.length} páginas no recuperables`,
      );
    }
    if ((manifest.consoleErrors?.length ?? 0) > 0) {
      errors.push(`el manifiesto registra ${manifest.consoleErrors.length} errores de consola`);
    }
  }

  for (const fileName of requiredDataFiles) {
    if (!(await exists(path.join(snapshotBase, 'data', fileName)))) {
      errors.push(`falta reference-snapshot/data/${fileName}`);
    }
  }

  const actualFiles = await walk(snapshotRoot);
  if (actualFiles.length > maxFiles) {
    errors.push(`el snapshot contiene ${actualFiles.length} archivos; máximo permitido ${maxFiles}`);
  }

  if (manifest?.files) {
    const expected = new Map();
    for (const record of manifest.files) {
      if (expected.has(record.path)) errors.push(`${record.path}: duplicado en el manifiesto`);
      expected.set(record.path, record);
    }

    for (const file of actualFiles) {
      const relative = path.relative(snapshotRoot, file).replaceAll(path.sep, '/');
      const body = await readFile(file);
      const record = expected.get(relative);
      const fileStat = await stat(file);
      if (!record) {
        errors.push(`${relative}: no figura en el manifiesto`);
        continue;
      }
      if (record.bytes !== body.length) errors.push(`${relative}: tamaño distinto`);
      if (record.sha256 !== sha256(body)) errors.push(`${relative}: SHA-256 distinto`);
      if (fileStat.size > maxAssetBytes) errors.push(`${relative}: supera 25 MiB`);
      expected.delete(relative);
    }
    for (const missing of expected.keys()) errors.push(`${missing}: falta en el snapshot`);
  }

  if (manifest?.snapshotFiles) {
    const expected = new Map();
    for (const record of manifest.snapshotFiles) {
      if (expected.has(record.path)) {
        errors.push(`${record.path}: auxiliar duplicado en el manifiesto`);
      }
      expected.set(record.path, record);
    }
    const auxiliaryFiles = [
      ...(await walk(path.join(snapshotBase, 'data'))),
      ...(await walk(path.join(snapshotBase, 'screenshots'))),
    ];
    for (const file of auxiliaryFiles) {
      const relative = path.relative(snapshotBase, file).replaceAll(path.sep, '/');
      const body = await readFile(file);
      const record = expected.get(relative);
      if (!record) {
        errors.push(`${relative}: auxiliar no figura en el manifiesto`);
        continue;
      }
      if (record.bytes !== body.length) errors.push(`${relative}: tamaño auxiliar distinto`);
      if (record.sha256 !== sha256(body)) errors.push(`${relative}: SHA-256 auxiliar distinto`);
      if (relative.startsWith('screenshots/') && body.length > 90 * 1024 * 1024) {
        errors.push(`${relative}: captura supera 90 MiB`);
      }
      expected.delete(relative);
    }
    for (const missing of expected.keys()) errors.push(`${missing}: auxiliar faltante`);
  }

  for (const page of manifest?.pages ?? []) {
    for (const viewport of ['mobile', 'tablet', 'desktop']) {
      const screenshot = page.screenshots?.[viewport];
      if (!screenshot || !(await exists(path.resolve(screenshot)))) {
        errors.push(`${page.route}: falta captura ${viewport}`);
      }
    }
  }

  const forbiddenExtensions = new Set(['.bak', '.gz', '.log', '.php', '.sql', '.tar', '.zip']);
  const forbiddenNames = new Set(['.env', 'wp-config.php']);
  const forbiddenPatterns = [
    /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/giu,
    /chocolate-chimpanzee-908881\.hostingersite\.com/giu,
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/gu,
    /\bgithub_pat_[A-Za-z0-9_]{50,}\b/gu,
    /\bcfut_[A-Za-z0-9_-]{20,}\b/gu,
    /\bAKIA[0-9A-Z]{16}\b/gu,
    /\bsk-[A-Za-z0-9]{20,}\b/gu,
    /(?:DB_PASSWORD|AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY)\s*[:=]/giu,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
  ];
  const textExtensions = new Set([
    '.css',
    '.html',
    '.js',
    '.json',
    '.svg',
    '.txt',
    '.webmanifest',
    '.xml',
  ]);

  for (const file of await walk(snapshotBase)) {
    const relative = path.relative(snapshotBase, file).replaceAll(path.sep, '/');
    const extension = path.extname(file).toLowerCase();
    if (forbiddenNames.has(path.basename(file).toLowerCase()) || forbiddenExtensions.has(extension)) {
      errors.push(`${relative}: archivo prohibido`);
    }
    if (relative.endsWith('.map')) errors.push(`${relative}: sourcemap no permitido`);
    if (!textExtensions.has(extension) && path.basename(file) !== '_redirects') continue;
    const content = await readFile(file, 'utf8').catch(() => '');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) errors.push(`${relative}: patrón prohibido ${pattern}`);
      pattern.lastIndex = 0;
    }
  }

  const report = {
    required,
    files: actualFiles.length,
    pages: manifest?.pages?.length ?? 0,
    resources: manifest?.resources?.length ?? 0,
    snapshotFiles: manifest?.snapshotFiles?.length ?? 0,
    errors,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (errors.length > 0) {
    process.stderr.write(`Snapshot inválido: ${errors.length} error(es).\n`);
    process.exitCode = 3;
  }
}
