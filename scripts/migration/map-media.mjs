#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readZipCentralDirectory } from './lib/zip-inspector.mjs';
import { parseWxr } from './lib/wxr-parser.mjs';

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const zipPath = argumentValue('--zip');
const wxrPath = argumentValue('--wxr');
const output = argumentValue('--out');
if (!zipPath || !wxrPath || !output) {
  throw new Error('Uso: node map-media.mjs --zip archivos.zip --wxr export.xml --out medios.json');
}

const [entries, xml] = await Promise.all([
  readZipCentralDirectory(zipPath),
  readFile(wxrPath, 'utf8'),
]);
const wxr = parseWxr(xml);
const uploadEntries = entries.filter(
  (entry) => !entry.directory && entry.name.startsWith('wp-content/uploads/'),
);
const byBasename = new Map();
for (const entry of uploadEntries) {
  const basename = path.posix.basename(entry.name);
  const list = byBasename.get(basename) ?? [];
  list.push(entry);
  byBasename.set(basename, list);
}

const media = wxr.items
  .filter((item) => item.type === 'attachment')
  .map((item) => {
    const attachedFile = item.meta.find((entry) => entry.key === '_wp_attached_file')?.value ?? '';
    const basename = path.posix.basename(attachedFile);
    const matches = byBasename.get(basename) ?? [];
    return {
      attachmentId: item.id,
      title: item.title,
      attachedFile,
      archiveMatches: matches.map((entry) => ({
        path: entry.name,
        bytes: entry.uncompressedSize,
      })),
      recovered: matches.length > 0,
    };
  })
  .sort((a, b) => a.attachmentId - b.attachmentId);

await writeFile(output, `${JSON.stringify(media, null, 2)}\n`, 'utf8');
process.stdout.write(
  `Mapeados ${media.length} adjuntos; ${media.filter((item) => item.recovered).length} recuperados.\n`,
);
