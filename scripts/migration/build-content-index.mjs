#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const sqlPath = argumentValue('--sql');
const wxrPath = argumentValue('--wxr');
const output = argumentValue('--out');
if (!sqlPath || !wxrPath || !output) {
  throw new Error(
    'Uso: node build-content-index.mjs --sql sql.json --wxr wxr.json --out contenido.json',
  );
}

const sql = JSON.parse(await readFile(sqlPath, 'utf8'));
const wxr = JSON.parse(await readFile(wxrPath, 'utf8'));
const wxrById = new Map(wxr.items.map((item) => [item.id, item]));

const index = sql.content
  .map((item) => {
    const corroboration = wxrById.get(item.id);
    return {
      id: item.id,
      type: item.type,
      status: item.status,
      title: item.title,
      slug: item.slug,
      date: item.date,
      modified: item.modified,
      primarySource: 'sql',
      corroboratedByWxr: Boolean(corroboration),
      differences: corroboration
        ? [
            item.title !== corroboration.title ? 'title' : null,
            item.slug !== corroboration.slug ? 'slug' : null,
            item.status !== corroboration.status ? 'status' : null,
            item.content !== corroboration.content ? 'content' : null,
          ].filter(Boolean)
        : ['missing-in-wxr'],
    };
  })
  .sort((a, b) => Number(a.id) - Number(b.id));

await writeFile(output, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
process.stdout.write(`Índice determinista generado con ${index.length} elementos.\n`);
