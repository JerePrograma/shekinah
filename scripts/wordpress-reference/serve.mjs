#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const arguments_ = process.argv.slice(2);
const valueFor = (flag, fallback) => {
  const index = arguments_.indexOf(flag);
  return index >= 0 ? arguments_[index + 1] : fallback;
};
const root = path.resolve(valueFor('--root', 'dist'));
const host = valueFor('--host', '127.0.0.1');
const port = Number(valueFor('--port', '4321'));

const mimeTypes = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function safePathname(rawUrl) {
  const url = new URL(rawUrl, `http://${host}:${port}`);
  const decoded = decodeURIComponent(url.pathname);
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, '');
  if (normalized.includes('..')) return null;
  return normalized;
}

const server = createServer(async (request, response) => {
  const relative = safePathname(request.url ?? '/');
  if (relative === null) {
    response.writeHead(400).end('Bad request');
    return;
  }

  const candidates = [];
  const direct = path.join(root, relative);
  candidates.push(direct);
  if (!path.extname(relative)) candidates.push(path.join(direct, 'index.html'));
  if (relative === '') candidates.push(path.join(root, 'index.html'));

  let selected;
  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue;
    const candidateStat = await stat(candidate);
    if (candidateStat.isFile()) {
      selected = candidate;
      break;
    }
  }

  if (!selected) {
    const notFound = path.join(root, '404.html');
    if (await exists(notFound)) {
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      createReadStream(notFound).pipe(response);
      return;
    }
    response.writeHead(404).end('Not found');
    return;
  }

  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes[path.extname(selected).toLowerCase()] ?? 'application/octet-stream',
  });
  createReadStream(selected).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(`Sirviendo ${root} en http://${host}:${port}\n`);
});
