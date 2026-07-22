#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const host = valueAfter('--host', '127.0.0.1');
const port = Number(valueAfter('--port', '4321'));
const root = path.resolve('dist');
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split(/[?#]/u)[0] || '/');
  const normalized = path.posix.normalize(decoded).replace(/^\.\.(?:\/|$)/u, '');
  const relative = normalized.replace(/^\/+/, '');
  const candidate = path.resolve(root, relative);
  return candidate.startsWith(`${root}${path.sep}`) || candidate === root ? candidate : null;
}

async function resolveFile(urlPath) {
  const candidate = safePath(urlPath);
  if (!candidate) return null;
  if (await exists(candidate)) {
    const candidateStat = await stat(candidate);
    if (candidateStat.isFile()) return { file: candidate, status: 200 };
    if (candidateStat.isDirectory()) {
      const indexFile = path.join(candidate, 'index.html');
      if (await exists(indexFile)) return { file: indexFile, status: 200 };
    }
  }
  if (!path.extname(candidate)) {
    const directoryIndex = path.join(candidate, 'index.html');
    if (await exists(directoryIndex)) return { file: directoryIndex, status: 200 };
  }
  const notFound = path.join(root, '404.html');
  return (await exists(notFound)) ? { file: notFound, status: 404 } : null;
}

const server = http.createServer(async (request, response) => {
  try {
    const resolved = await resolveFile(request.url ?? '/');
    if (!resolved) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const extension = path.extname(resolved.file).toLowerCase();
    response.writeHead(resolved.status, {
      'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
      'content-type': mimeTypes.get(extension) ?? 'application/octet-stream',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(resolved.file).pipe(response);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Internal server error');
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Shekinah preview: http://${host}:${port}\n`);
});
