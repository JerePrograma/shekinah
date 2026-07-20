#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { extractPublicWordPressData } from './lib/sql-parser.mjs';

const [input, outputFlag, output] = process.argv.slice(2);
if (!input || outputFlag !== '--out' || !output) {
  throw new Error('Uso: node parse-wordpress-sql.mjs <dump.sql> --out <salida.json>');
}

const sql = await readFile(input, 'utf8');
const data = extractPublicWordPressData(sql);

const sanitized = {
  source: {
    tablePrefix: data.prefix,
    tableCount: data.tableCount,
  },
  options: data.options,
  content: data.posts.map((post) => ({
    id: post.ID,
    type: post.post_type,
    status: post.post_status,
    slug: post.post_name,
    title: post.post_title,
    excerpt: post.post_excerpt,
    content: post.post_content,
    date: post.post_date,
    modified: post.post_modified,
    parent: post.post_parent,
    mimeType: post.post_mime_type,
  })),
  mediaMetadata: data.postmeta
    .filter((meta) => meta.meta_key !== '_wp_attachment_metadata')
    .map((meta) => ({
      postId: meta.post_id,
      key: meta.meta_key,
      value: meta.meta_value,
    })),
  terms: data.terms,
  taxonomies: data.taxonomies,
  relationships: data.relationships,
};

await writeFile(output, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
process.stdout.write(
  `Extraídos ${sanitized.content.length} elementos públicos o técnicos sin usuarios ni credenciales.\n`,
);
