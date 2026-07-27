import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const EXPECTED = Object.freeze({
  path: 'public/assets/logo-shekinah.png',
  bytes: 105_443,
  sha256: 'cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747',
  width: 383,
  height: 383,
  bitDepth: 8,
  colorType: 6,
});

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const filePath = resolve(EXPECTED.path);
const bytes = await readFile(filePath);
const digest = createHash('sha256').update(bytes).digest('hex');

if (!bytes.subarray(0, 8).equals(pngSignature)) {
  throw new Error(`${EXPECTED.path} no contiene una firma PNG válida.`);
}

const chunkType = bytes.subarray(12, 16).toString('ascii');
if (chunkType !== 'IHDR') {
  throw new Error(`${EXPECTED.path} no contiene IHDR en la posición esperada.`);
}

const width = bytes.readUInt32BE(16);
const height = bytes.readUInt32BE(20);
const bitDepth = bytes.readUInt8(24);
const colorType = bytes.readUInt8(25);

const failures = [
  bytes.length === EXPECTED.bytes ? null : `tamaño=${bytes.length}`,
  digest === EXPECTED.sha256 ? null : `sha256=${digest}`,
  width === EXPECTED.width ? null : `ancho=${width}`,
  height === EXPECTED.height ? null : `alto=${height}`,
  bitDepth === EXPECTED.bitDepth ? null : `profundidad=${bitDepth}`,
  colorType === EXPECTED.colorType ? null : `tipoColor=${colorType}`,
].filter(Boolean);

if (failures.length > 0) {
  throw new Error(`El logo autorizado no coincide: ${failures.join(', ')}.`);
}

console.log(
  `Logo verificado: ${EXPECTED.path}, ${width}x${height}, ${bytes.length} bytes, sha256=${digest}`,
);
