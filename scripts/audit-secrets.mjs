#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  '.astro',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
  '.wrangler',
]);
const binaryExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.zip',
]);
const forbiddenExtensions = new Set(['.sql', '.zip', '.tar', '.gz', '.bak']);
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
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

const findings = [];
for (const file of await walk(root)) {
  const extension = path.extname(file).toLowerCase();
  const relative = path.relative(root, file).replaceAll(path.sep, '/');

  if (forbiddenExtensions.has(extension)) {
    findings.push(`${relative}: extensión de evidencia o respaldo no permitida`);
    continue;
  }
  if (binaryExtensions.has(extension)) continue;

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
if (findings.length) throw new Error(`Se detectaron ${findings.length} posibles secretos.`);
