#!/usr/bin/env node
import { loadContract, parseArguments, validateHomeHtml } from './content-validation.mjs';

const args = parseArguments(process.argv.slice(2));
if (!args['base-url']) throw new Error('Falta --base-url.');
const base = new URL(args['base-url']);
const contract = await loadContract(
  args.contract ?? 'scripts/wordpress-reference/content-contract.json',
);
const attempts = Number(args.attempts ?? 10);
const delayMs = Number(args['delay-ms'] ?? 5000);
let lastErrors = [];
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(base, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      headers: { 'cache-control': 'no-cache' },
    });
    const html = await response.text();
    const errors = response.ok
      ? validateHomeHtml(html, contract, base)
      : [`HTTP ${response.status}`];
    for (const route of contract.requiredNavigationPaths ?? []) {
      const routeResponse = await fetch(new URL(route, base), {
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
        headers: { 'cache-control': 'no-cache' },
      });
      if (!routeResponse.ok) errors.push(`${route}: HTTP ${routeResponse.status}`);
    }
    if (errors.length === 0) {
      process.stdout.write(
        `${JSON.stringify({ baseUrl: base.origin, attempt, displayName: contract.displayName, errors }, null, 2)}\n`,
      );
      process.exit(0);
    }
    lastErrors = errors;
  } catch (error) {
    lastErrors = [error.message];
  }
  if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
}
process.stderr.write(
  `${JSON.stringify({ baseUrl: base.origin, attempts, errors: lastErrors }, null, 2)}\n`,
);
process.exit(3);
