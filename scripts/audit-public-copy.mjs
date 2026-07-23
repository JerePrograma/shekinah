#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const prohibited = [
  /\bHostinger\b/iu,
  /\bmigraci[oó]n(?:es)?\b/iu,
  /\brecuperad[oa]s?\b/iu,
  /\bevidencia(?:s)?\b/iu,
  /\bversionad[oa]s?\b/iu,
  /\bfuente original\b/iu,
  /\bcat[aá]logo original\b/iu,
  /\bprecio hist[oó]rico\b/iu,
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else if (entry.name.endsWith('.html')) files.push(fullPath);
  }
  return files;
}

if (!(await exists(root))) {
  process.stderr.write('Auditoría bloqueada: no existe dist/.\n');
  process.exit(2);
}

const findings = [];
for (const file of await walk(root)) {
  const html = await readFile(file, 'utf8');
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  for (const pattern of prohibited) {
    if (pattern.test(html)) findings.push(`${relative}: contiene lenguaje técnico no publicable (${pattern.source})`);
    pattern.lastIndex = 0;
  }
}

if (findings.length) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Contenido público verificado: sin lenguaje técnico de migración o procedencia.\n');
}
