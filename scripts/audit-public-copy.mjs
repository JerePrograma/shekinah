#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.txt', '.webmanifest', '.xml']);
const prohibited = [
  /\bHostinger\b/iu,
  /\bWordPress\b/iu,
  /\bCloudflare\b/iu,
  /herbalarioonline\.com/iu,
  /pages\.dev/iu,
  /\bmigraci[oó]n(?:es)?\b/iu,
  /\bproductos?\s+recuperad[oa]s?\b/iu,
  /\bcat[aá]logo\s+original(?:\s+recuperado)?\b/iu,
  /\bfuente\s+recuperada\b/iu,
  /\bevidencia\s+hist[oó]rica\b/iu,
  /\bcontenido\s+versionado\b/iu,
  /\bprecio\s+hist[oó]rico\b/iu,
  /\brecuperad[oa]s?\s+(?:de|desde)\s+(?:el\s+)?(?:sitio|cat[aá]logo|fuente|plataforma)\s+original\b/iu,
  /\bstore_[A-Z0-9]+\b/iu,
  /\bprod_[A-Z0-9_-]+\b/iu,
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
    else if (textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files;
}

if (!(await exists(root))) {
  process.stderr.write('Auditoría bloqueada: no existe dist/.\n');
  process.exit(2);
}

const findings = [];
for (const file of await walk(root)) {
  const content = await readFile(file, 'utf8');
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  for (const pattern of prohibited) {
    if (pattern.test(content)) findings.push(`${relative}: contiene lenguaje o identificadores técnicos no publicables (${pattern.source})`);
    pattern.lastIndex = 0;
  }
}

if (findings.length) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Bundle público verificado: sin rastros técnicos ni frases de migración.\n');
}
