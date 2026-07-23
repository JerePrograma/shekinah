#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const defaults = {
  output: 'generated/hostinger-original',
  assets: 'public/images/original/catalog',
};
const markers = [
  'Hostinger Website Builder', 'herbalarioonline.com', 'astro-island', 'pageData',
  'assets.zyrosite.com', 'cdn.zyrosite.com', 'store_', 'prod_',
];
const imageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);

function args(argv) {
  const result = { source: null, output: defaults.output, assets: defaults.assets, download: false, powershell: null, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw new Error(`Falta valor para ${key}`);
      return next;
    };
    if (key === '--source') result.source = value();
    else if (key === '--output') result.output = value();
    else if (key === '--assets') result.assets = value();
    else if (key === '--write-powershell') result.powershell = value();
    else if (key === '--download-assets') result.download = true;
    else if (key === '--self-test') result.selfTest = true;
    else if (key === '--help' || key === '-h') result.help = true;
    else throw new Error(`Argumento desconocido: ${key}`);
  }
  return result;
}

function help() {
  return `Uso:
  node scripts/import-hostinger-original.mjs --source <archivo-html> [opciones]

Opciones:
  --output <directorio>       Salida JSON (${defaults.output})
  --assets <directorio>       Imágenes locales (${defaults.assets})
  --download-assets           Descarga y deduplica imágenes públicas
  --write-powershell <ruta>   Genera wrapper PowerShell conservador
  --self-test                 Pruebas internas sin red
`;
}

const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value, (_key, item) => {
  if (item instanceof Map) return { $type: 'Map', value: [...item] };
  if (item instanceof Set) return { $type: 'Set', value: [...item] };
  if (typeof item === 'bigint') return { $type: 'BigInt', value: item.toString() };
  if (ArrayBuffer.isView(item)) return { $type: item.constructor.name, value: [...item] };
  if (item === Infinity || item === -Infinity) return { $type: 'Infinity', sign: item < 0 ? -1 : 1 };
  return item;
}, 2)}\n`;

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, json(value), 'utf8');
  await rename(temporary, file);
}

function entities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: '\u00a0', quot: '"' };
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/giu, (match, entity) => {
    const key = entity.toLowerCase();
    if (key.startsWith('#x')) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    return named[key] ?? match;
  });
}

function tags(html, name) {
  const found = [];
  const lower = html.toLowerCase();
  const needle = `<${name}`;
  let offset = 0;
  while ((offset = lower.indexOf(needle, offset)) >= 0) {
    let quote = null;
    let cursor = offset + needle.length;
    for (; cursor < html.length; cursor += 1) {
      const character = html[cursor];
      if (quote && character === quote) quote = null;
      else if (!quote && (character === '"' || character === "'")) quote = character;
      else if (!quote && character === '>') break;
    }
    if (cursor === html.length) throw new Error(`Etiqueta <${name}> truncada`);
    found.push(html.slice(offset, cursor + 1));
    offset = cursor + 1;
  }
  return found;
}

function attributes(tag) {
  const result = {};
  const body = tag.replace(/^<[^\s>]+/u, '').replace(/>$/u, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu;
  for (const match of body.matchAll(pattern)) result[match[1]] = entities(match[2] ?? match[3] ?? match[4] ?? '');
  return result;
}

function decodeAstro(value) {
  const seen = new WeakMap();
  const visit = (node) => {
    if (!Array.isArray(node)) return node;
    if (seen.has(node)) return seen.get(node);
    const [tag, payload] = node;
    if (!Number.isInteger(tag) || tag < 0 || tag > 11) {
      const result = [];
      seen.set(node, result);
      node.forEach((item) => result.push(visit(item)));
      return result;
    }
    if (tag === 0) {
      const result = {};
      seen.set(node, result);
      for (const [key, item] of Object.entries(payload ?? {})) result[key] = visit(item);
      return result;
    }
    if (tag === 1) {
      const result = [];
      seen.set(node, result);
      for (const item of payload ?? []) result.push(visit(item));
      return result;
    }
    if (tag === 2) return new RegExp(payload?.[0] ?? '', payload?.[1] ?? '');
    if (tag === 3) return new Date(payload);
    if (tag === 4) return new Map((payload ?? []).map(([key, item]) => [visit(key), visit(item)]));
    if (tag === 5) return new Set((payload ?? []).map(visit));
    if (tag === 6) return BigInt(payload);
    if (tag === 7) return new URL(payload);
    if (tag === 8) return Uint8Array.from(payload ?? []);
    if (tag === 9) return Uint16Array.from(payload ?? []);
    if (tag === 10) return Uint32Array.from(payload ?? []);
    return Number(payload) < 0 ? -Infinity : Infinity;
  };
  return visit(value);
}

function astro(html) {
  const values = [];
  const errors = [];
  tags(html, 'astro-island').forEach((tag, index) => {
    const props = attributes(tag).props;
    if (!props) return;
    try { values.push({ index, value: decodeAstro(JSON.parse(props)) }); }
    catch (error) { errors.push({ index, message: error instanceof Error ? error.message : String(error) }); }
  });
  return { values, errors };
}

function walk(value, visitor, trail = [], seen = new WeakSet()) {
  visitor(value, trail);
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Map) for (const [key, item] of value) walk(item, visitor, [...trail, String(key)], seen);
  else if (value instanceof Set) [...value].forEach((item, index) => walk(item, visitor, [...trail, String(index)], seen));
  else if (!ArrayBuffer.isView(value) && !(value instanceof Date) && !(value instanceof URL) && !(value instanceof RegExp)) {
    for (const [key, item] of Object.entries(value)) walk(item, visitor, [...trail, key], seen);
  }
}

function field(object, names) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
  const keys = new Map(Object.keys(object).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = keys.get(name.toLowerCase());
    if (key && object[key] !== null && object[key] !== undefined && object[key] !== '') return object[key];
  }
  return null;
}

function absolute(value, base = 'https://herbalarioonline.com/') {
  if (!value || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/iu.test(value)) return null;
  try {
    const url = new URL(entities(value), base);
    url.hash = '';
    return url.href;
  } catch { return null; }
}

function slug(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'sin-slug';
}

function image(value, context) {
  if (typeof value === 'string') {
    const url = absolute(value);
    if (!url) return null;
    const extension = path.posix.extname(new URL(url).pathname).toLowerCase();
    return imageExtensions.has(extension) || /(image|asset|cdn|zyrosite)/iu.test(url) ? { url, alt: context ?? null } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const source = field(value, ['url', 'src', 'originalUrl', 'imageUrl', 'fullUrl']);
  return source ? image(source, field(value, ['alt', 'altText', 'title']) ?? context) : null;
}

function isProduct(object, trail) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
  const keys = Object.keys(object).map((key) => key.toLowerCase());
  const identity = keys.some((key) => ['id', '_id', 'productid', 'slug', 'name', 'title'].includes(key));
  const commerce = keys.some((key) => /(price|currency|variant|stock|sku|fraction|unit|category|product)/u.test(key));
  return identity && (commerce || trail.some((part) => /(product|catalog|store)/iu.test(part)));
}

function product(object, trail) {
  const idValue = field(object, ['id', '_id', 'productId', 'product_id', 'uuid']);
  const nameValue = field(object, ['name', 'title', 'productName']);
  if (!idValue && !nameValue) return null;
  const id = String(idValue ?? `derived-${hash(`${trail.join('.')}:${nameValue}`).slice(0, 16)}`);
  const name = String(nameValue ?? id);
  const routeValue = field(object, ['slug', 'path', 'url', 'handle']);
  const productSlug = slug(typeof routeValue === 'string' ? routeValue.split('/').filter(Boolean).at(-1) : routeValue ?? name);
  const rawPrice = field(object, ['price', 'amount', 'salePrice', 'regularPrice', 'basePrice']);
  const priceObject = rawPrice && typeof rawPrice === 'object' ? rawPrice : object;
  const amountValue = rawPrice && typeof rawPrice === 'object' ? field(rawPrice, ['amount', 'value', 'price']) : rawPrice;
  const amount = typeof amountValue === 'number' ? amountValue : Number.parseFloat(String(amountValue ?? '').replace(/[^0-9,.-]/gu, '').replace(',', '.'));
  const images = [];
  for (const key of ['image', 'images', 'gallery', 'media', 'thumbnail']) {
    const candidate = field(object, [key]);
    const values = Array.isArray(candidate) ? candidate : [candidate];
    values.forEach((item) => {
      const normalized = image(item, name);
      if (normalized && !images.some((current) => current.url === normalized.url)) images.push(normalized);
    });
  }
  const rawCategories = field(object, ['categories', 'category', 'collections', 'tags']);
  const categories = (Array.isArray(rawCategories) ? rawCategories : rawCategories ? [rawCategories] : [])
    .map((item) => typeof item === 'object' ? field(item, ['name', 'title', 'slug']) : item).filter(Boolean).map(String);
  return {
    id, name, slug: productSlug,
    originalUrl: typeof routeValue === 'string' ? absolute(routeValue) : null,
    description: String(field(object, ['description', 'body', 'content', 'summary']) ?? '').trim() || null,
    categories,
    price: Number.isFinite(amount) ? amount : null,
    currency: String(field(priceObject, ['currency', 'currencyCode']) ?? '').trim() || null,
    minimumFraction: field(object, ['minimumFraction', 'minFraction', 'fraction', 'fractionSize']),
    unit: field(object, ['unit', 'unitName', 'measureUnit']),
    availability: field(object, ['availability', 'stockStatus', 'status']),
    images,
    sourceTrail: trail.join('.'),
  };
}

function normalize(decoded) {
  const products = new Map();
  const pages = new Map();
  const assets = new Map();
  const storeIds = new Set();
  const phones = new Set();
  decoded.forEach((root) => walk(root.value, (item, trail) => {
    if (isProduct(item, trail)) {
      const normalized = product(item, trail);
      const previous = normalized ? products.get(normalized.id) : null;
      if (normalized && (!previous || JSON.stringify(normalized).length > JSON.stringify(previous).length)) products.set(normalized.id, normalized);
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const route = field(item, ['path', 'route', 'url', 'slug']);
      const title = field(item, ['title', 'name', 'pageTitle']);
      const blocks = field(item, ['blocks', 'sections', 'content']);
      if (route && title && blocks) {
        const pathname = new URL(absolute(route)).pathname.replace(/\/?$/u, '/');
        pages.set(pathname, { route: pathname, title: String(title), id: String(field(item, ['id', '_id', 'pageId']) ?? `derived-${hash(pathname).slice(0, 16)}`) });
      }
    }
    if (typeof item === 'string') {
      for (const match of item.matchAll(/\bstore_[A-Za-z0-9_]+\b/gu)) storeIds.add(match[0]);
      for (const match of item.matchAll(/\b(?:54)?(?:9)?223\d{7}\b/gu)) phones.add(match[0]);
      const normalized = image(item, trail.at(-1));
      if (normalized) assets.set(normalized.url, { url: normalized.url, usedBy: [`data:${trail.join('.')}`] });
    }
  }));
  const productList = [...products.values()].sort((left, right) => left.id.localeCompare(right.id));
  productList.forEach((item) => item.images.forEach((current) => assets.set(current.url, { url: current.url, usedBy: [`product:${item.id}`] })));
  const categories = [...new Set(productList.flatMap((item) => item.categories))].sort((left, right) => left.localeCompare(right, 'es'));
  return { pages: [...pages.values()].sort((a, b) => a.route.localeCompare(b.route)), products: productList, categories, assets: [...assets.values()].sort((a, b) => a.url.localeCompare(b.url)), storeIds: [...storeIds].sort(), phones: [...phones].sort() };
}

async function retry(url) {
  let failure;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      failure = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw failure;
}

async function download(list, destination) {
  await mkdir(destination, { recursive: true });
  const byHash = new Map();
  const result = [];
  for (const asset of list) {
    try {
      const response = await retry(asset.url);
      const mime = response.headers.get('content-type') ?? '';
      if (!mime.toLowerCase().startsWith('image/')) throw new Error(`MIME no visual: ${mime || 'ausente'}`);
      const body = Buffer.from(await response.arrayBuffer());
      if (!body.length) throw new Error('Recurso vacío');
      if (/^\s*</u.test(body.subarray(0, 256).toString('utf8')) && !mime.includes('svg')) throw new Error('Respuesta HTML inesperada');
      const sha256 = hash(body);
      let local = byHash.get(sha256);
      if (!local) {
        const original = new URL(asset.url).pathname;
        const extension = imageExtensions.has(path.posix.extname(original).toLowerCase()) ? path.posix.extname(original).toLowerCase() : '.bin';
        local = path.join(destination, `${slug(path.posix.basename(original, path.posix.extname(original))).slice(0, 70)}-${sha256.slice(0, 12)}${extension}`);
        await writeFile(local, body);
        byHash.set(sha256, local);
      }
      result.push({ ...asset, status: 'downloaded', localPath: path.relative(process.cwd(), local).replaceAll(path.sep, '/'), mime, size: body.length, sha256 });
    } catch (error) { result.push({ ...asset, status: 'failed', message: error instanceof Error ? error.message : String(error) }); }
  }
  return result;
}

function duplicates(items, key) {
  const counts = new Map();
  items.forEach((item) => counts.set(String(item[key] ?? ''), (counts.get(String(item[key] ?? '')) ?? 0) + 1));
  return [...counts].filter(([value, count]) => value && count > 1).map(([value, count]) => ({ value, count }));
}

function powershell() {
  return `param(
  [Parameter(Mandatory = $true)][string]$OriginalHtmlPath,
  [string]$RepoPath = (Get-Location).Path,
  [switch]$DownloadAssets,
  [switch]$RunVerification
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command finalizó con código $LASTEXITCODE" }
}
$RepoPath = (Resolve-Path -LiteralPath $RepoPath).Path
$OriginalHtmlPath = (Resolve-Path -LiteralPath $OriginalHtmlPath).Path
Set-Location -LiteralPath $RepoPath
foreach ($Tool in @('git', 'node', 'npm')) {
  if (-not (Get-Command $Tool -ErrorAction SilentlyContinue)) { throw "No se encontró $Tool en PATH" }
}
Invoke-Checked git @('status')
$Dirty = (& git status --porcelain=v1)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el working tree' }
if ($Dirty) { throw ('Existen cambios locales; revisalos antes de importar:' + [Environment]::NewLine + ($Dirty -join [Environment]::NewLine)) }
$Branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw 'No se pudo determinar la rama actual' }
Invoke-Checked git @('remote', '-v')
Invoke-Checked git @('rev-parse', 'HEAD')
Invoke-Checked git @('log', '-1', '--oneline')
if ($Branch -ne 'main') { Invoke-Checked git @('switch', 'main') }
Invoke-Checked git @('fetch', 'origin')
Invoke-Checked git @('pull', '--ff-only', 'origin', 'main')
Invoke-Checked git @('status', '--short')
$Hash = (Get-FileHash -LiteralPath $OriginalHtmlPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Fuente SHA-256: $Hash"
$Arguments = @('scripts/import-hostinger-original.mjs', '--source', $OriginalHtmlPath, '--output', 'generated/hostinger-original', '--assets', 'public/images/original/catalog')
if ($DownloadAssets) { $Arguments += '--download-assets' }
Invoke-Checked node $Arguments
if ($RunVerification) { Invoke-Checked npm @('run', 'verify') }
Invoke-Checked git @('status', '--short')
Write-Host 'Importación finalizada. Revisá manifiestos y diff antes de commit/push.'
`;
}

async function selfTest() {
  assert.equal(entities('&quot;a&amp;b&quot;'), '"a&b"');
  const typed = decodeAstro([0, { values: [1, [[3, '2026-07-22T00:00:00Z'], [7, 'https://example.com/a']]] }]);
  assert.equal(typed.values[0].toISOString(), '2026-07-22T00:00:00.000Z');
  assert.equal(typed.values[1].href, 'https://example.com/a');
  const props = JSON.stringify([0, { products: [1, [[0, { id: 'prod_1', name: 'Cúrcuma', slug: 'curcuma', price: 1234, image: 'https://cdn.zyrosite.com/a.jpg' }]]] }]);
  const html = `<meta name="generator" content="Hostinger Website Builder"><astro-island props="${props.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></astro-island>`;
  const parsed = astro(html);
  const snapshot = normalize(parsed.values);
  assert.equal(parsed.errors.length, 0);
  assert.equal(snapshot.products[0].id, 'prod_1');
  assert.equal(snapshot.products[0].price, 1234);
  assert.equal(snapshot.assets.length, 1);
  process.stdout.write('Self-test Hostinger/Astro: PASS\n');
}

async function main() {
  const options = args(process.argv.slice(2));
  if (options.help) return process.stdout.write(help());
  if (options.selfTest) return selfTest();
  if (options.powershell) {
    await mkdir(path.dirname(path.resolve(options.powershell)), { recursive: true });
    await writeFile(path.resolve(options.powershell), powershell(), 'utf8');
  }
  if (!options.source) {
    if (options.powershell) return;
    throw new Error(`Debe indicarse --source.\n${help()}`);
  }
  const source = path.resolve(options.source);
  const body = await readFile(source);
  const html = body.toString('utf8');
  if (html.includes('\uFFFD')) throw new Error('La fuente contiene caracteres UTF-8 inválidos');
  const foundMarkers = markers.filter((marker) => html.includes(marker));
  if (!foundMarkers.some((marker) => ['Hostinger Website Builder', 'astro-island', 'pageData', 'assets.zyrosite.com', 'cdn.zyrosite.com'].includes(marker))) {
    throw new Error('El archivo no contiene marcadores suficientes de Hostinger/Astro');
  }
  const decoded = astro(html);
  if (!decoded.values.length) throw new Error('No se decodificó ningún props de astro-island');
  const snapshot = normalize(decoded.values);
  if (!snapshot.products.length) throw new Error('No se recuperó ningún producto; no se generará una migración engañosa');
  const assetManifest = options.download ? await download(snapshot.assets, path.resolve(options.assets)) : snapshot.assets.map((asset) => ({ ...asset, status: 'not-downloaded' }));
  const routes = [
    ...snapshot.pages.map((page) => ({ originalRoute: page.route, type: 'page', sourceId: page.id, finalRoute: page.route, status: 'discovered', expectedHttpStatus: 200 })),
    ...snapshot.products.map((item) => ({ originalRoute: item.originalUrl ? new URL(item.originalUrl).pathname : `/${item.slug}/`, type: 'product', sourceId: item.id, finalRoute: `/${item.slug}/`, status: 'discovered', expectedHttpStatus: 200 })),
  ].sort((left, right) => `${left.finalRoute}:${left.type}`.localeCompare(`${right.finalRoute}:${right.type}`));
  const missing = {
    productsWithoutDescription: snapshot.products.filter((item) => !item.description).map((item) => item.id),
    productsWithoutImages: snapshot.products.filter((item) => !item.images.length).map((item) => item.id),
    failedAssets: assetManifest.filter((item) => item.status === 'failed'),
    decodeErrors: decoded.errors,
  };
  const collisions = { productIds: duplicates(snapshot.products, 'id'), productSlugs: duplicates(snapshot.products, 'slug'), productNames: duplicates(snapshot.products, 'name'), pageRoutes: duplicates(snapshot.pages, 'route') };
  const output = path.resolve(options.output);
  await rm(output, { recursive: true, force: true });
  await Promise.all([
    writeJson(path.join(output, 'source-report.json'), { sourceFile: path.basename(source), sha256: hash(body), size: body.length, markers: foundMarkers }),
    writeJson(path.join(output, 'schema-report.json'), { astroIslandsDecoded: decoded.values.length, rootKeys: [...new Set(decoded.values.flatMap((item) => item.value && typeof item.value === 'object' ? Object.keys(item.value) : []))].sort(), pages: snapshot.pages.length, products: snapshot.products.length, categories: snapshot.categories.length, assets: snapshot.assets.length }),
    writeJson(path.join(output, 'decoded-astro.json'), decoded.values),
    writeJson(path.join(output, 'site-snapshot.json'), snapshot),
    writeJson(path.join(output, 'route-manifest.json'), routes),
    writeJson(path.join(output, 'asset-manifest.json'), assetManifest),
    writeJson(path.join(output, 'collision-report.json'), collisions),
    writeJson(path.join(output, 'missing-data.json'), missing),
  ]);
  process.stdout.write(json({ result: 'success', output: path.relative(process.cwd(), output).replaceAll(path.sep, '/'), sourceSha256: hash(body), pages: snapshot.pages.length, products: snapshot.products.length, categories: snapshot.categories.length, assets: snapshot.assets.length, downloadedAssets: assetManifest.filter((item) => item.status === 'downloaded').length, failedAssets: assetManifest.filter((item) => item.status === 'failed').length, decodeErrors: decoded.errors.length }));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
