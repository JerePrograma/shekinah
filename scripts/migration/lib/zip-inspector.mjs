import { open } from 'node:fs/promises';
import path from 'node:path';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

export function isUnsafeArchivePath(name) {
  const normalized = name.replaceAll('\\', '/');
  return (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//u.test(normalized) ||
    normalized.split('/').includes('..') ||
    normalized.includes('\0')
  );
}

export async function readZipCentralDirectory(filePath) {
  const handle = await open(filePath, 'r');

  try {
    const stats = await handle.stat();
    const tailLength = Math.min(stats.size, 65_557);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, stats.size - tailLength);

    let eocdOffset = -1;
    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === EOCD_SIGNATURE) {
        eocdOffset = index;
        break;
      }
    }

    if (eocdOffset === -1) throw new Error('No se encontró el directorio central del ZIP.');

    const totalEntries = tail.readUInt16LE(eocdOffset + 10);
    const centralSize = tail.readUInt32LE(eocdOffset + 12);
    const centralOffset = tail.readUInt32LE(eocdOffset + 16);

    if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      throw new Error('ZIP64 no está soportado por este inspector de solo lectura.');
    }

    const central = Buffer.alloc(centralSize);
    await handle.read(central, 0, centralSize, centralOffset);

    const entries = [];
    let cursor = 0;

    while (cursor < central.length) {
      if (central.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
        throw new Error(`Firma inválida en el directorio central, offset ${cursor}.`);
      }

      const flags = central.readUInt16LE(cursor + 8);
      const compressionMethod = central.readUInt16LE(cursor + 10);
      const compressedSize = central.readUInt32LE(cursor + 20);
      const uncompressedSize = central.readUInt32LE(cursor + 24);
      const fileNameLength = central.readUInt16LE(cursor + 28);
      const extraLength = central.readUInt16LE(cursor + 30);
      const commentLength = central.readUInt16LE(cursor + 32);
      const externalAttributes = central.readUInt32LE(cursor + 38);
      const nameStart = cursor + 46;
      const name = central
        .subarray(nameStart, nameStart + fileNameLength)
        .toString(flags & 0x800 ? 'utf8' : 'latin1');

      entries.push({
        name,
        compressedSize,
        uncompressedSize,
        compressionMethod,
        encrypted: Boolean(flags & 0x1),
        directory: name.endsWith('/'),
        unixMode: externalAttributes >>> 16,
        unsafePath: isUnsafeArchivePath(name),
        extension: path.extname(name).toLowerCase() || null,
      });

      cursor = nameStart + fileNameLength + extraLength + commentLength;
    }

    if (entries.length !== totalEntries) {
      throw new Error(`El ZIP declara ${totalEntries} entradas pero se leyeron ${entries.length}.`);
    }

    return entries;
  } finally {
    await handle.close();
  }
}
