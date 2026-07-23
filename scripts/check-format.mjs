#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ignored = new Set(['.git', '.ssr', 'dist', 'node_modules', 'playwright-report', 'test-results']);
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.txt', '.webmanifest', '.xml', '.yml', '.yaml']);
const findings = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(fullPath);
    else if (textExtensions.has(path.extname(entry.name).toLowerCase()) || entry.name.startsWith('.')) {
      const relative = path.relative(process.cwd(), fullPath).replaceAll(path.sep, '/');
      const content = await readFile(fullPath, 'utf8').catch(() => null);
      if (content === null) continue;
      if (content.includes('\r')) findings.push(`${relative}: contiene CRLF o retornos de carro`);
      if (!content.endsWith('\n')) findings.push(`${relative}: falta salto de línea final`);
      content.split('\n').forEach((line, index) => {
        if (/\s+$/u.test(line)) findings.push(`${relative}:${index + 1}: espacio final`);
      });
    }
  }
}

await walk(process.cwd());
if (findings.length > 0) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Formato básico verificado: LF, sin espacios finales y EOF correcto.\n');
}
