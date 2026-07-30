import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const logo = Object.freeze({
  path: 'public/assets/logo-shekinah.png',
  bytes: 105_443,
  sha256: 'cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747',
  width: 383,
  height: 383,
  bitDepth: 8,
  colorType: 6,
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function signatureMatches(bytes, extension) {
  if (extension === '.png') {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (extension === '.jpg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8;
  }
  if (extension === '.webp') {
    return (
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

const logoBytes = await readFile(resolve(projectRoot, logo.path));
const logoFailures = [
  signatureMatches(logoBytes, '.png') ? null : 'firma',
  logoBytes.length === logo.bytes ? null : `tamaño=${logoBytes.length}`,
  sha256(logoBytes) === logo.sha256 ? null : `sha256=${sha256(logoBytes)}`,
  logoBytes.subarray(12, 16).toString('ascii') === 'IHDR' ? null : 'IHDR',
  logoBytes.readUInt32BE(16) === logo.width ? null : `ancho=${logoBytes.readUInt32BE(16)}`,
  logoBytes.readUInt32BE(20) === logo.height ? null : `alto=${logoBytes.readUInt32BE(20)}`,
  logoBytes.readUInt8(24) === logo.bitDepth ? null : `profundidad=${logoBytes.readUInt8(24)}`,
  logoBytes.readUInt8(25) === logo.colorType ? null : `tipoColor=${logoBytes.readUInt8(25)}`,
].filter(Boolean);

if (logoFailures.length > 0) {
  throw new Error(`El logo autorizado no coincide: ${logoFailures.join(', ')}.`);
}

const assetManifest = JSON.parse(
  await readFile(join(projectRoot, 'catalog', 'catalog-assets.json'), 'utf8'),
);
if (!Array.isArray(assetManifest.images) || assetManifest.images.length !== 484) {
  throw new Error('El manifiesto debe declarar exactamente 484 imágenes de catálogo.');
}

const imageRoot = join(projectRoot, 'public', 'images', 'original', 'catalog');
const actualNames = (await readdir(imageRoot)).sort();
const expectedNames = assetManifest.images
  .map(({ path }) => path.split('/').at(-1))
  .sort();
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  throw new Error('Los activos del catálogo no coinciden exactamente con el manifiesto.');
}

for (const asset of assetManifest.images) {
  const name = asset.path.split('/').at(-1);
  const extension = extname(name).toLowerCase();
  if (
    !/^\/images\/original\/catalog\/[a-f0-9]{64}\.(?:jpg|png|webp)$/u.test(asset.path) ||
    extension.slice(1) !== asset.extension ||
    !Number.isInteger(asset.references) ||
    asset.references < 1 ||
    !Array.isArray(asset.productSlugs) ||
    asset.productSlugs.length !== asset.references
  ) {
    throw new Error(`Entrada inválida en el manifiesto de activos: ${String(asset.path)}.`);
  }
  const bytes = await readFile(join(imageRoot, name));
  if (!signatureMatches(bytes, extension)) {
    throw new Error(`${asset.path} no contiene una firma ${asset.extension.toUpperCase()} válida.`);
  }
  if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) {
    throw new Error(`${asset.path} no coincide con su tamaño o SHA-256 autorizado.`);
  }
}

console.log(
  `Activos verificados: logo exacto y ${assetManifest.images.length} imágenes de catálogo declaradas, referenciadas y sin huérfanos.`,
);
