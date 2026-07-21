#!/usr/bin/env node
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const snapshotRoot = path.resolve('reference-snapshot/site');
const snapshotIndex = path.join(snapshotRoot, 'index.html');
const distRoot = path.resolve('dist');
const forbiddenNames = new Set(['.env', 'wp-config.php']);
const forbiddenExtensions = new Set(['.bak', '.gz', '.log', '.php', '.sql', '.tar', '.zip']);
const maxAssetBytes = 25 * 1024 * 1024;
const maxFiles = 20_000;
const defaultHeaders = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), geolocation=(), microphone=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/wp-content/*
  Cache-Control: public, max-age=31536000, immutable
`;

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
    else files.push(fullPath);
  }
  return files;
}

if (!(await exists(snapshotIndex))) {
  process.stderr.write(
    'Build bloqueado: falta reference-snapshot/site/index.html. Ejecute la migración real desde el WordPress restaurado antes de construir o desplegar.\n',
  );
  process.exitCode = 2;
} else {
  const sourceFiles = await walk(snapshotRoot);
  const errors = [];
  if (sourceFiles.length > maxFiles) {
    errors.push(
      `el snapshot contiene ${sourceFiles.length} archivos; Cloudflare Pages Free admite hasta ${maxFiles}`,
    );
  }

  for (const file of sourceFiles) {
    const relative = path.relative(snapshotRoot, file).replaceAll(path.sep, '/');
    const extension = path.extname(file).toLowerCase();
    const fileStat = await stat(file);
    if (forbiddenNames.has(path.basename(file).toLowerCase()) || forbiddenExtensions.has(extension)) {
      errors.push(`${relative}: archivo prohibido en la salida estática`);
    }
    if (relative.endsWith('.map')) errors.push(`${relative}: sourcemap no permitido`);
    if (fileStat.size > maxAssetBytes) {
      errors.push(
        `${relative}: ${fileStat.size} bytes supera el límite de 25 MiB de Cloudflare Pages`,
      );
    }
  }

  if (errors.length > 0) {
    process.stderr.write(`Build bloqueado por ${errors.length} error(es):\n- ${errors.join('\n- ')}\n`);
    process.exitCode = 3;
  } else {
    await rm(distRoot, { recursive: true, force: true });
    await mkdir(distRoot, { recursive: true });
    await cp(snapshotRoot, distRoot, { recursive: true, force: true });

    const headersPath = path.join(distRoot, '_headers');
    if (await exists(headersPath)) {
      const headers = await readFile(headersPath, 'utf8');
      if (!headers.includes('X-Content-Type-Options')) {
        throw new Error('El _headers recuperado existe pero no contiene X-Content-Type-Options.');
      }
    } else {
      await writeFile(headersPath, defaultHeaders, 'utf8');
    }

    process.stdout.write(
      `Build generado desde snapshot real: ${sourceFiles.length} archivos copiados a dist/.\n`,
    );
  }
}
