#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function run(command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${arguments_.join(' ')} terminó con código ${code}.`));
    });
  });
}

const snapshotRoot = path.resolve('reference-snapshot/site');
const snapshotIndex = path.join(snapshotRoot, 'index.html');
const distRoot = path.resolve('dist');

if (await exists(snapshotIndex)) {
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(distRoot, { recursive: true });
  await cp(snapshotRoot, distRoot, { recursive: true, force: true });
  process.stdout.write('Build generado desde reference-snapshot/site.\n');
} else {
  process.stdout.write('No existe snapshot WordPress; se usa el build Astro de transición.\n');
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  await run(executable, ['astro', 'build']);
}
