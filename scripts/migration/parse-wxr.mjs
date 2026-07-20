#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { parseWxr } from './lib/wxr-parser.mjs';

const [input, outputFlag, output] = process.argv.slice(2);
if (!input || outputFlag !== '--out' || !output) {
  throw new Error('Uso: node parse-wxr.mjs <export.xml> --out <salida.json>');
}

const xml = await readFile(input, 'utf8');
const parsed = parseWxr(xml);

const sanitized = {
  title: parsed.title,
  language: parsed.language,
  wxrVersion: parsed.wxrVersion,
  items: parsed.items.map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    type: item.type,
    status: item.status,
    date: item.date,
    modified: item.modified,
    content: item.content,
    excerpt: item.excerpt,
    attachmentUrl: item.attachmentUrl,
    categories: item.categories,
    meta: item.meta.filter((entry) =>
      [
        '_wp_page_template',
        '_thumbnail_id',
        '_wp_attached_file',
        '_wp_attachment_metadata',
        '_wp_attachment_image_alt',
      ].includes(entry.key),
    ),
  })),
};

await writeFile(output, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
process.stdout.write(`Extraídos ${sanitized.items.length} elementos del WXR.\n`);
