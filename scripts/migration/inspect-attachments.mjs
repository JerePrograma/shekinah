#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { listCreatedTables, detectTablePrefix } from './lib/sql-parser.mjs';
import { readZipCentralDirectory } from './lib/zip-inspector.mjs';
import { parseWxr } from './lib/wxr-parser.mjs';

function parseArguments(argv) {
  const inputs = [];
  let output;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') output = argv[++index];
    else inputs.push(argv[index]);
  }
  if (inputs.length === 0) {
    throw new Error('Uso: node inspect-attachments.mjs <archivo...> [--out inventario.json]');
  }
  return { inputs, output };
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  await pipeline(
    createReadStream(filePath),
    new Writable({
      write(chunk, _encoding, callback) {
        hash.update(chunk);
        callback();
      },
    }),
  );
  return hash.digest('hex');
}

function apparentType(buffer, filePath) {
  if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return { format: 'ZIP', mime: 'application/zip' };
  }
  const text = buffer.toString('utf8');
  if (text.startsWith('<?xml')) return { format: 'XML/WXR', mime: 'application/xml' };
  if (text.startsWith('-- phpMyAdmin SQL Dump')) {
    return { format: 'SQL dump', mime: 'application/sql' };
  }
  return {
    format: path.extname(filePath).replace('.', '').toUpperCase() || 'unknown',
    mime: 'application/octet-stream',
  };
}

async function inspect(filePath) {
  const fileStats = await stat(filePath);
  const buffer = await readFile(filePath);
  const head = buffer.subarray(0, 128);
  const type = apparentType(head, filePath);
  const result = {
    name: path.basename(filePath),
    sizeBytes: fileStats.size,
    sha256: await sha256(filePath),
    apparentMime: type.mime,
    format: type.format,
  };

  if (type.format === 'ZIP') {
    const entries = await readZipCentralDirectory(filePath);
    const duplicates = new Map();
    for (const entry of entries) {
      duplicates.set(entry.name, (duplicates.get(entry.name) ?? 0) + 1);
    }
    return {
      ...result,
      purpose: 'Copia de archivos del sitio',
      details: {
        entries: entries.length,
        files: entries.filter((entry) => !entry.directory).length,
        directories: entries.filter((entry) => entry.directory).length,
        encryptedEntries: entries.filter((entry) => entry.encrypted).length,
        unsafePaths: entries.filter((entry) => entry.unsafePath).map((entry) => entry.name),
        duplicateNames: [...duplicates.entries()]
          .filter(([, count]) => count > 1)
          .map(([name]) => name),
        totalUncompressedBytes: entries.reduce((total, entry) => total + entry.uncompressedSize, 0),
        sensitiveCandidates: entries
          .filter((entry) =>
            /(^|\/)(wp-config\.php|\.env|\.htaccess|debug\.log|error_log)$/iu.test(entry.name),
          )
          .map((entry) => entry.name),
      },
    };
  }

  const text = buffer.toString('utf8');
  if (type.format === 'SQL dump') {
    return {
      ...result,
      purpose: 'Volcado de base de datos de solo lectura',
      details: {
        tablePrefix: detectTablePrefix(text),
        tableCount: listCreatedTables(text).length,
        containsUserTable: /CREATE TABLE `[^`]*users`/u.test(text),
        containsSensitiveAuthenticationData:
          /user_pass|session_tokens|application_passwords|AUTH_KEY|SECURE_AUTH_KEY/iu.test(text),
      },
    };
  }

  if (type.format === 'XML/WXR') {
    const parsed = parseWxr(text);
    return {
      ...result,
      purpose: 'Exportación complementaria de contenido',
      details: {
        wxrVersion: parsed.wxrVersion,
        language: parsed.language,
        itemCount: parsed.items.length,
        countsByType: Object.fromEntries(
          [...new Set(parsed.items.map((item) => item.type))]
            .sort()
            .map((typeName) => [
              typeName,
              parsed.items.filter((item) => item.type === typeName).length,
            ]),
        ),
      },
    };
  }

  return result;
}

const { inputs, output } = parseArguments(process.argv.slice(2));
const inventory = [];
for (const input of inputs) inventory.push(await inspect(input));
const json = `${JSON.stringify(inventory, null, 2)}\n`;
if (output) await writeFile(output, json, 'utf8');
else process.stdout.write(json);
