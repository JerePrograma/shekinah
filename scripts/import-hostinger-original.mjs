#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { helpText, importSources, parseArguments } from './lib/hostinger-importer.mjs';
import { stableJson } from './lib/hostinger-parser.mjs';

export { helpText, importSources, parseArguments, readSources } from './lib/hostinger-importer.mjs';
export {
  decodeAstro,
  decodeEntities,
  extractAstroIslands,
  parseAttributes,
  scanStartTags,
  stableJson,
} from './lib/hostinger-parser.mjs';
export { normalizeDecodedSources } from './lib/hostinger-normalizer.mjs';

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  const result = await importSources(options);
  process.stdout.write(stableJson({ result: 'success', ...result }));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
