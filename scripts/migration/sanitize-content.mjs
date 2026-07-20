#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { sanitizeRecoveredHtml } from './lib/sanitize.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error('Uso: node sanitize-content.mjs <entrada.html> <salida.html>');
}

const source = await readFile(input, 'utf8');
await writeFile(output, `${sanitizeRecoveredHtml(source)}\n`, 'utf8');
process.stdout.write('Contenido saneado sin ejecutar código recuperado.\n');
