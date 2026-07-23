import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractAstroIslands, sha256, stableJson } from './hostinger-parser.mjs';
import { normalizeDecodedSources } from './hostinger-normalizer.mjs';

const DEFAULT_OUTPUT = 'generated/hostinger-original';
const DEFAULT_ASSETS = 'public/images/original/catalog';
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const SOURCE_MARKERS = [
  'Hostinger Website Builder',
  'herbalarioonline.com',
  'astro-island',
  'pageData',
  'assets.zyrosite.com',
  'cdn.zyrosite.com',
  'store_',
  'prod_',
];

function normalizeSlug(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '') || 'asset';
}

export function parseArguments(argv) {
  const options = {
    sources: [],
    output: DEFAULT_OUTPUT,
    assets: DEFAULT_ASSETS,
    downloadAssets: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const readValue = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`Falta valor para ${argument}`);
      index += 1;
      return next;
    };
    if (argument === '--source') options.sources.push(readValue());
    else if (argument === '--output') options.output = readValue();
    else if (argument === '--assets') options.assets = readValue();
    else if (argument === '--download-assets') options.downloadAssets = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Argumento desconocido: ${argument}`);
  }
  return options;
}

export function helpText() {
  return `Uso:
  node scripts/import-hostinger-original.mjs --source <html-o-directorio> [--source <otro>] [opciones]

Opciones:
  --output <directorio>  Salida determinista (${DEFAULT_OUTPUT})
  --assets <directorio>  Activos descargados (${DEFAULT_ASSETS})
  --download-assets      Descarga y deduplica imágenes públicas
  --help                 Muestra esta ayuda
`;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, stableJson(value), 'utf8');
  await rename(temporary, filePath);
}

async function discoverFiles(sourcePath) {
  const resolved = path.resolve(sourcePath);
  const details = await stat(resolved);
  if (details.isFile()) return [resolved];
  if (!details.isDirectory()) throw new Error(`Fuente no soportada: ${resolved}`);

  const files = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const current = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(current);
      else if (entry.isFile() && HTML_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(current);
    }
  }
  await walk(resolved);
  return files;
}

export async function readSources(sourcePaths) {
  const discovered = await Promise.all(sourcePaths.map(discoverFiles));
  const files = [...new Set(discovered.flat())].sort();
  if (!files.length) throw new Error('No se encontraron archivos HTML en las fuentes indicadas.');

  const sources = [];
  for (const file of files) {
    const body = await readFile(file);
    const html = body.toString('utf8');
    const invalidUtf8 = html.includes('\uFFFD');
    const markers = SOURCE_MARKERS.filter((marker) => html.includes(marker));
    const extracted = invalidUtf8
      ? {
          islands: [],
          errors: [
            {
              sourceFile: file,
              code: 'INVALID_UTF8',
              message: 'La fuente contiene caracteres UTF-8 inválidos.',
            },
          ],
        }
      : extractAstroIslands(html, file);

    sources.push({
      sourceFile: file,
      relativeSourceFile: path.relative(process.cwd(), file).replaceAll(path.sep, '/'),
      size: body.length,
      sha256: sha256(body),
      markers,
      invalidUtf8,
      truncated: extracted.errors.some((error) => error.code === 'TRUNCATED_TAG'),
      islands: extracted.islands,
      errors: extracted.errors,
    });
  }
  return sources;
}

async function fetchWithRetry(url) {
  let failure;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
        headers: {
          accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
          'user-agent': 'ShekinahMigrationAudit/1.0 (+https://github.com/JerePrograma/shekinah)',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      failure = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  throw failure;
}

async function downloadAssets(assets, destination) {
  await mkdir(destination, { recursive: true });
  const byHash = new Map();
  const manifest = [];

  for (const asset of assets) {
    try {
      const response = await fetchWithRetry(asset.originalUrl);
      const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
      if (!mime.startsWith('image/')) throw new Error(`MIME no visual: ${mime || 'ausente'}`);

      const body = Buffer.from(await response.arrayBuffer());
      if (!body.length) throw new Error('Recurso vacío.');
      if (/^\s*</u.test(body.subarray(0, 256).toString('utf8')) && mime !== 'image/svg+xml') {
        throw new Error('Respuesta HTML inesperada.');
      }

      const digest = sha256(body);
      let localPath = byHash.get(digest);
      if (!localPath) {
        const originalPath = new URL(asset.originalUrl).pathname;
        const originalExtension = path.posix.extname(originalPath).toLowerCase();
        const extension = IMAGE_EXTENSIONS.has(originalExtension)
          ? originalExtension
          : mime === 'image/svg+xml'
            ? '.svg'
            : '.bin';
        const name = normalizeSlug(path.posix.basename(originalPath, originalExtension)).slice(0, 70);
        localPath = path.join(destination, `${name}-${digest.slice(0, 12)}${extension}`);
        await writeFile(localPath, body);
        byHash.set(digest, localPath);
      }

      manifest.push({
        ...asset,
        status: 'downloaded',
        localPath: path.relative(process.cwd(), localPath).replaceAll(path.sep, '/'),
        mime,
        size: body.length,
        sha256: digest,
      });
    } catch (error) {
      manifest.push({
        ...asset,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return manifest.sort((left, right) => left.originalUrl.localeCompare(right.originalUrl));
}

function duplicateReport(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = String(item[key] ?? '');
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value));
}

export async function importSources(options) {
  if (!options.sources?.length) throw new Error(`Debe indicarse al menos un --source.\n${helpText()}`);

  const decodedSources = await readSources(options.sources);
  const snapshot = normalizeDecodedSources(decodedSources);
  if (!snapshot.products.length) {
    throw new Error('No se recuperó ningún producto; no se generará una migración engañosa.');
  }

  const output = path.resolve(options.output ?? DEFAULT_OUTPUT);
  const assetManifest = options.downloadAssets
    ? await downloadAssets(snapshot.assets, path.resolve(options.assets ?? DEFAULT_ASSETS))
    : snapshot.assets.map((asset) => ({ ...asset, status: 'not-downloaded' }));

  const sources = decodedSources.map((source) => ({
    sourceFile: source.relativeSourceFile,
    size: source.size,
    sha256: source.sha256,
    markers: source.markers,
    invalidUtf8: source.invalidUtf8,
    truncated: source.truncated,
    islandsDecoded: source.islands.length,
    errors: source.errors,
  }));

  const routes = [
    ...snapshot.pages.map((page) => ({
      originalRoute: page.route,
      finalRoute: page.route,
      type: 'page',
      sourceId: page.id,
      provenance: 'hostinger-original',
    })),
    ...snapshot.products.map((product) => {
      const originalRoute = product.originalUrl ? new URL(product.originalUrl).pathname : `/${product.slug}/`;
      return {
        originalRoute,
        finalRoute: originalRoute.replace(/\/?$/u, '/'),
        type: 'product',
        sourceId: product.originalId ?? product.id,
        provenance: 'hostinger-original',
      };
    }),
  ].sort((left, right) => `${left.finalRoute}:${left.type}`.localeCompare(`${right.finalRoute}:${right.type}`));

  const collisions = {
    productIds: duplicateReport(snapshot.products, 'id'),
    productOriginalIds: duplicateReport(snapshot.products, 'originalId'),
    productSlugs: duplicateReport(snapshot.products, 'slug'),
    productNames: duplicateReport(snapshot.products, 'name'),
    pageRoutes: duplicateReport(snapshot.pages, 'route'),
    routePaths: duplicateReport(routes, 'finalRoute'),
  };

  const missing = {
    productsWithoutDescription: snapshot.products.filter((product) => !product.description).map((product) => product.id),
    productsWithoutImage: snapshot.products.filter((product) => !product.images.length).map((product) => product.id),
    productsWithoutPrice: snapshot.products.filter((product) => product.price === null).map((product) => product.id),
    failedAssets: assetManifest.filter((asset) => asset.status === 'failed'),
    decodeErrors: decodedSources.flatMap((source) => source.errors),
  };

  const fidelity = {
    metrics: [
      {
        metric: 'HTML sources',
        detected: decodedSources.length,
        recovered: decodedSources.filter((source) => source.islands.length > 0).length,
      },
      {
        metric: 'Astro islands',
        detected: decodedSources.reduce((total, source) => total + source.islands.length, 0),
        recovered: decodedSources.reduce((total, source) => total + source.islands.length, 0),
      },
      { metric: 'Products', detected: snapshot.products.length, recovered: snapshot.products.length },
      {
        metric: 'Product descriptions',
        detected: snapshot.products.length,
        recovered: snapshot.products.length - missing.productsWithoutDescription.length,
      },
      {
        metric: 'Product prices',
        detected: snapshot.products.length,
        recovered: snapshot.products.length - missing.productsWithoutPrice.length,
      },
      {
        metric: 'Product images',
        detected: snapshot.products.length,
        recovered: snapshot.products.length - missing.productsWithoutImage.length,
      },
      {
        metric: 'Assets downloaded',
        detected: snapshot.assets.length,
        recovered: assetManifest.filter((asset) => asset.status === 'downloaded').length,
      },
    ].map((item) => ({
      ...item,
      missing: item.detected - item.recovered,
      percentage: item.detected ? Number(((item.recovered / item.detected) * 100).toFixed(2)) : 100,
    })),
  };

  await rm(output, { recursive: true, force: true });
  await Promise.all([
    writeJson(path.join(output, 'sources.json'), sources),
    writeJson(
      path.join(output, 'decoded-astro.json'),
      decodedSources.map((source) => ({
        sourceFile: source.relativeSourceFile,
        sha256: source.sha256,
        islands: source.islands,
      })),
    ),
    writeJson(path.join(output, 'site.json'), { storeIds: snapshot.storeIds, phones: snapshot.phones }),
    writeJson(path.join(output, 'pages.json'), snapshot.pages),
    writeJson(path.join(output, 'products.json'), snapshot.products),
    writeJson(path.join(output, 'categories.json'), snapshot.categories),
    writeJson(path.join(output, 'routes.json'), routes),
    writeJson(path.join(output, 'assets.json'), assetManifest),
    writeJson(path.join(output, 'collisions.json'), collisions),
    writeJson(path.join(output, 'missing-data.json'), missing),
    writeJson(path.join(output, 'fidelity.json'), fidelity),
  ]);

  return {
    output: path.relative(process.cwd(), output).replaceAll(path.sep, '/'),
    sources: decodedSources.length,
    islands: decodedSources.reduce((total, source) => total + source.islands.length, 0),
    products: snapshot.products.length,
    categories: snapshot.categories.length,
    pages: snapshot.pages.length,
    assets: snapshot.assets.length,
    downloadedAssets: assetManifest.filter((asset) => asset.status === 'downloaded').length,
    failedAssets: assetManifest.filter((asset) => asset.status === 'failed').length,
    decodeErrors: missing.decodeErrors.length,
  };
}
