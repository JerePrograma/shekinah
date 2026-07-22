#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  loadContract,
  parseArguments,
  validateHomeHtml,
  validatePublicSettings,
  validatePublishedContent,
} from './content-validation.mjs';

const args = parseArguments(process.argv.slice(2));
if (!args.source || !args.metadata) {
  throw new Error(
    'Uso: validate-source.mjs --source <URL> --metadata <directorio> [--contract <ruta>]',
  );
}
const source = new URL(args.source);
const metadata = path.resolve(args.metadata);
const contract = await loadContract(
  args.contract ?? 'scripts/wordpress-reference/content-contract.json',
);
const settings = JSON.parse(await readFile(path.join(metadata, 'public-settings.json'), 'utf8'));
const published = JSON.parse(await readFile(path.join(metadata, 'published-content.json'), 'utf8'));
const response = await fetch(source, {
  redirect: 'follow',
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok) throw new Error(`La portada WordPress respondió HTTP ${response.status}`);
const html = await response.text();
const errors = [
  ...validatePublicSettings(settings, contract),
  ...validatePublishedContent(published, contract),
  ...validateHomeHtml(html, contract, source),
];
for (const route of contract.requiredNavigationPaths ?? []) {
  const routeResponse = await fetch(new URL(route, source), {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  if (!routeResponse.ok) errors.push(`${route} respondió HTTP ${routeResponse.status}`);
}
const report = {
  source: source.origin,
  displayName: contract.displayName,
  frontPage: settings.page_on_front,
  postsPage: settings.page_for_posts,
  publishedItems: published.length,
  errors,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (errors.length > 0) process.exitCode = 3;
