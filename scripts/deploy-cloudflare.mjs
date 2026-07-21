#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const commit = process.env.DEPLOY_COMMIT_SHA ?? process.env.GITHUB_SHA ?? '';
if (!/^[0-9a-f]{40}$/iu.test(commit)) {
  process.stderr.write(
    'Deploy bloqueado: falta DEPLOY_COMMIT_SHA con el SHA Git validado de 40 caracteres.\n',
  );
  process.exit(2);
}

const args = [
  path.resolve('node_modules/wrangler/bin/wrangler.js'),
  'pages',
  'deploy',
  'dist',
  '--project-name',
  'shekinah',
  '--branch',
  'main',
  '--commit-hash',
  commit,
];
process.stdout.write(
  `wrangler pages deploy dist --project-name shekinah --branch main --commit-hash ${commit}\n`,
);
const result = spawnSync(process.execPath, args, { env: process.env, stdio: 'inherit' });
process.exit(result.status ?? 1);
