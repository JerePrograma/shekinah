#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const snapshotBase = path.resolve('reference-snapshot');
const snapshotRoot = path.join(snapshotBase, 'site');
const manifestPath = path.join(snapshotBase, 'manifest.json');

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

function sha256(body) {
  return createHash('sha256').update(body).digest('hex');
}

if (!(await exists(path.join(snapshotRoot, 'index.html')))) {
  process.stdout.write('Snapshot WordPress todavía no generado; verificación omitida.\n');
  process.exit(0);
}
if (!(await exists(manifestPath))) throw new Error('Falta reference-snapshot/manifest.json.');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const expected = new Map(manifest.files.map((file) => [file.path, file]));
const actualFiles = await walk(snapshotRoot);
const errors = [];

for (const file of actualFiles) {
  const relative = path.relative(snapshotRoot, file).replaceAll(path.sep, '/');
  const body = await readFile(file);
  const record = expected.get(relative);
  if (!record) {
    errors.push(`${relative}: no figura en el manifiesto`);
    continue;
  }
  if (record.bytes !== body.length) errors.push(`${relative}: tamaño distinto`);
  if (record.sha256 !== sha256(body)) errors.push(`${relative}: SHA-256 distinto`);
  expected.delete(relative);
}
for (const missing of expected.keys()) errors.push(`${missing}: falta en el snapshot`);

const forbiddenPatterns = [
  /https?:\/\/localhost(?::\d+)?/giu,
  /chocolate-chimpanzee-908881\.hostingersite\.com/giu,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/gu,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/gu,
  /\bAKIA[0-9A-Z]{16}\b/gu,
  /\bsk-[A-Za-z0-9]{20,}\b/gu,
  /(?:DB_PASSWORD|AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY)\s*[:=]/giu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
];
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);
for (const file of await walk(snapshotBase)) {
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const content = await readFile(file, 'utf8').catch(() => '');
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      errors.push(`${path.relative(snapshotBase, file)}: patrón prohibido ${pattern}`);
    }
    pattern.lastIndex = 0;
  }
}

process.stdout.write(
  `${JSON.stringify({ files: actualFiles.length, pages: manifest.pages.length, errors }, null, 2)}\n`,
);
if (errors.length > 0) throw new Error(`Snapshot inválido: ${errors.length} error(es).`);
