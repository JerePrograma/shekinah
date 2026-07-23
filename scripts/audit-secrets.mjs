#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  '.astro',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const ignoredFiles = new Set(['.ci/build.log']);
const binaryExtensions = new Set([
  '.avif',
  '.eot',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mp3',
  '.mp4',
  '.otf',
  '.pdf',
  '.png',
  '.ttf',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
]);
const forbiddenExtensions = new Set(['.bak', '.gz', '.log', '.php', '.sql', '.tar', '.zip']);
const forbiddenNames = new Set(['.env', 'wp-config.php']);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/u,
  /\bsk-[A-Za-z0-9]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\b(?:AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY|DB_PASSWORD)\s*[:=]\s*["'][^"']{8,}["']/iu,
  /\b(?:password|passwd|pwd)\s*[:=]\s*["'][^"'${}<]{8,}["']/iu,
];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

function hasExpectedSignature(extension, body) {
  const hex = body.subarray(0, 16).toString('hex');
  const ascii = body.subarray(0, 16).toString('ascii');
  if (extension === '.png') return hex.startsWith('89504e470d0a1a0a');
  if (extension === '.jpg' || extension === '.jpeg') return hex.startsWith('ffd8ff');
  if (extension === '.gif') return ascii.startsWith('GIF8');
  if (extension === '.webp') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
  if (extension === '.pdf') return ascii.startsWith('%PDF-');
  if (extension === '.woff') return ascii.startsWith('wOFF');
  if (extension === '.woff2') return ascii.startsWith('wOF2');
  if (extension === '.otf') return ascii.startsWith('OTTO');
  if (extension === '.ttf') return hex.startsWith('00010000') || ascii.startsWith('true');
  if (extension === '.ico') return hex.startsWith('00000100');
  if (extension === '.webm') return hex.startsWith('1a45dfa3');
  if (extension === '.mp4') return ascii.slice(4, 8) === 'ftyp';
  if (extension === '.avif') return ascii.slice(4, 8) === 'ftyp';
  return true;
}

const findings = [];
for (const file of await walk(root)) {
  const extension = path.extname(file).toLowerCase();
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const baseName = path.basename(file).toLowerCase();

  if (ignoredFiles.has(relative)) continue;
  if (forbiddenNames.has(baseName) || forbiddenExtensions.has(extension)) {
    findings.push(`${relative}: archivo no permitido`);
    continue;
  }
  if (binaryExtensions.has(extension)) {
    const fileStat = await stat(file);
    if (fileStat.size === 0) findings.push(`${relative}: binario vacío`);
    if (fileStat.size > 100 * 1024 * 1024) findings.push(`${relative}: binario supera 100 MiB`);
    const body = await readFile(file);
    if (!hasExpectedSignature(extension, body)) {
      findings.push(`${relative}: firma no coincide con la extensión ${extension}`);
    }
    continue;
  }

  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch {
    continue;
  }

  for (const pattern of secretPatterns) {
    if (pattern.test(content)) findings.push(`${relative}: posible secreto (${pattern})`);
    pattern.lastIndex = 0;
  }
}

process.stdout.write(
  `${JSON.stringify({ scannedRoot: '.', findings, result: findings.length ? 'fail' : 'pass' }, null, 2)}\n`,
);
if (findings.length) {
  process.stderr.write(
    `Se detectaron ${findings.length} posibles secretos o archivos prohibidos.\n`,
  );
  process.exitCode = 2;
}
