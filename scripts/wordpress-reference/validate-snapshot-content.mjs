#!/usr/bin/env node
import { loadContract, parseArguments, validateSnapshotRoot } from './content-validation.mjs';

const args = parseArguments(process.argv.slice(2));
const snapshotRoot = args['snapshot-root'] ?? 'reference-snapshot';
const contract = await loadContract(
  args.contract ?? 'scripts/wordpress-reference/content-contract.json',
);
const result = await validateSnapshotRoot(snapshotRoot, contract);
const report = {
  snapshotRoot,
  displayName: contract.displayName,
  pages: result.manifest.pages?.length ?? 0,
  redirects: result.manifest.redirects?.length ?? 0,
  forms: result.manifest.totals?.forms ?? 0,
  errors: result.errors,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (result.errors.length > 0) process.exitCode = 3;
