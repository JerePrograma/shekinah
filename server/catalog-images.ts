import {
  deleteCatalogProduct,
  getCatalogProductDetail,
  isCatalogImageReferenced,
  replaceCatalogProductImages,
} from './catalog-store';
import { HttpError, jsonResponse } from './http';
import type {
  CatalogProductDetail,
  ProductImage,
} from '../src/catalog/model';
import { isManagedCatalogImagePath } from '../src/catalog/model';
import type { D1Database, Env, R2Bucket, R2Object } from './platform';

export const MAX_CATALOG_IMAGE_BYTES = 4 * 1024 * 1024;
export const CATALOG_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const publicKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u;
const contentTypes = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const);

type CatalogImageContentType = keyof typeof contentTypes;

export type CatalogImageUpload = Readonly<{
  bytes: Uint8Array;
  contentType: CatalogImageContentType;
  extension: (typeof contentTypes)[CatalogImageContentType];
}>;

export function requireCatalogImageBucket(env: Env): R2Bucket {
  if (env.CATALOG_IMAGES === undefined) {
    throw new HttpError(
      503,
      'CATALOG_IMAGE_STORAGE_UNAVAILABLE',
      'El almacenamiento de imágenes todavía no está configurado.',
    );
  }
  return env.CATALOG_IMAGES;
}

export async function readCatalogImageUpload(request: Request): Promise<CatalogImageUpload> {
  const rawContentType = (request.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    ?.trim()
    .toLocaleLowerCase('en');
  if (rawContentType === undefined || !Object.hasOwn(contentTypes, rawContentType)) {
    throw new HttpError(
      415,
      'UNSUPPORTED_IMAGE_TYPE',
      'La imagen debe ser JPEG, PNG o WebP.',
    );
  }
  const contentType = rawContentType as CatalogImageContentType;
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/u.test(declaredLength)) {
      throw new HttpError(400, 'INVALID_CONTENT_LENGTH', 'El tamaño declarado no es válido.');
    }
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 1) {
      throw new HttpError(400, 'INVALID_IMAGE', 'La imagen está vacía.');
    }
    if (parsedLength > MAX_CATALOG_IMAGE_BYTES) {
      throw imageTooLarge();
    }
  }

  const bytes = await readBoundedBytes(request, MAX_CATALOG_IMAGE_BYTES);
  if (bytes.byteLength === 0) {
    throw new HttpError(400, 'INVALID_IMAGE', 'La imagen está vacía.');
  }
  if (!signatureMatches(bytes, contentType)) {
    throw new HttpError(
      415,
      'IMAGE_SIGNATURE_MISMATCH',
      'El contenido del archivo no coincide con el formato declarado.',
    );
  }

  return Object.freeze({ bytes, contentType, extension: contentTypes[contentType] });
}

export async function replaceCatalogProductImage(
  database: D1Database,
  bucket: R2Bucket,
  productId: string,
  actor: string,
  request: Request,
): Promise<CatalogProductDetail> {
  const current = await getCatalogProductDetail(database, productId);
  if (current === null) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'El producto no existe.');
  }
  const upload = await readCatalogImageUpload(request);
  const publicKey = `${crypto.randomUUID()}.${upload.extension}`;
  const storageKey = storageKeyFromPublicKey(publicKey);
  const source = `/api/catalog-images/${publicKey}`;
  const image = Object.freeze({ src: source, alt: current.name });
  const stored = await bucket.put(storageKey, upload.bytes, {
    httpMetadata: {
      contentType: upload.contentType,
      cacheControl: CATALOG_IMAGE_CACHE_CONTROL,
    },
  });
  if (stored === null) {
    throw new HttpError(
      503,
      'CATALOG_IMAGE_UPLOAD_FAILED',
      'No se pudo almacenar la imagen.',
    );
  }

  let replacement: Awaited<ReturnType<typeof replaceCatalogProductImages>>;
  try {
    replacement = await replaceCatalogProductImages(database, productId, [image], actor);
  } catch (error: unknown) {
    await bucket.delete(storageKey).catch(() => undefined);
    throw error;
  }
  await cleanupUnreferencedManagedImages(
    database,
    bucket,
    replacement.previousImages,
    source,
  );
  return replacement.product;
}

export async function removeCatalogProductImage(
  database: D1Database,
  bucket: R2Bucket | undefined,
  productId: string,
  actor: string,
): Promise<CatalogProductDetail> {
  const current = await getCatalogProductDetail(database, productId);
  if (current === null) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'El producto no existe.');
  }
  const hasManagedImage = current.images.some((image) => managedImageStorageKey(image.src) !== null);
  if (hasManagedImage && bucket === undefined) {
    throw new HttpError(
      503,
      'CATALOG_IMAGE_STORAGE_UNAVAILABLE',
      'El almacenamiento de imágenes todavía no está configurado.',
    );
  }
  const replacement = await replaceCatalogProductImages(database, productId, [], actor);
  if (bucket !== undefined) {
    await cleanupUnreferencedManagedImages(database, bucket, replacement.previousImages);
  }
  return replacement.product;
}

export async function deleteCatalogProductAndCleanupImages(
  database: D1Database,
  bucket: R2Bucket | undefined,
  productId: string,
  actor: string,
): Promise<void> {
  const current = await getCatalogProductDetail(database, productId);
  if (current === null) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'El producto no existe.');
  }
  const hasManagedImage = current.images.some((image) => managedImageStorageKey(image.src) !== null);
  if (hasManagedImage && bucket === undefined) {
    throw new HttpError(
      503,
      'CATALOG_IMAGE_STORAGE_UNAVAILABLE',
      'El almacenamiento de imágenes todavía no está configurado.',
    );
  }

  await deleteCatalogProduct(database, productId, actor);
  if (bucket !== undefined) {
    await cleanupUnreferencedManagedImages(database, bucket, current.images);
  }
}

export async function serveCatalogImage(
  request: Request,
  env: Env,
  publicKey: string,
): Promise<Response> {
  if (!publicKeyPattern.test(publicKey)) {
    return jsonResponse(
      { error: { code: 'INVALID_IMAGE_KEY', message: 'La imagen solicitada no es válida.' } },
      400,
    );
  }
  let bucket: R2Bucket;
  try {
    bucket = requireCatalogImageBucket(env);
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: { code: error.code, message: error.message } }, error.status);
    }
    throw error;
  }
  const key = storageKeyFromPublicKey(publicKey);
  if (request.method === 'HEAD') {
    const object = await bucket.head(key);
    if (object === null) {
      return jsonResponse(
        { error: { code: 'IMAGE_NOT_FOUND', message: 'La imagen no existe.' } },
        404,
      );
    }
    return new Response(null, {
      status: 200,
      headers: catalogImageResponseHeaders(object, publicKey),
    });
  }
  const object = await bucket.get(key);
  if (object === null) {
    return jsonResponse(
      { error: { code: 'IMAGE_NOT_FOUND', message: 'La imagen no existe.' } },
      404,
    );
  }
  const headers = catalogImageResponseHeaders(object, publicKey);
  return new Response(object.body, { status: 200, headers });
}

export function managedImageStorageKey(source: string): string | null {
  if (!isManagedCatalogImagePath(source)) return null;
  const publicKey = source.slice('/api/catalog-images/'.length);
  return publicKeyPattern.test(publicKey) ? storageKeyFromPublicKey(publicKey) : null;
}

function storageKeyFromPublicKey(publicKey: string): string {
  return `products/${publicKey}`;
}

async function cleanupUnreferencedManagedImages(
  database: D1Database,
  bucket: R2Bucket,
  previousImages: readonly ProductImage[],
  retainedSource?: string,
): Promise<void> {
  const sources = new Set(previousImages.map((image) => image.src));
  for (const source of sources) {
    if (source === retainedSource) continue;
    const storageKey = managedImageStorageKey(source);
    if (storageKey === null) continue;
    try {
      if (!(await isCatalogImageReferenced(database, source))) {
        await bucket.delete(storageKey);
      }
    } catch (error: unknown) {
      console.error('Could not clean catalog image', {
        name: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }
}

function catalogImageResponseHeaders(object: R2Object, publicKey: string): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', CATALOG_IMAGE_CACHE_CONTROL);
  headers.set('content-length', String(object.size));
  headers.set('content-type', contentTypeFromPublicKey(publicKey));
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('etag', object.httpEtag);
  headers.set('x-content-type-options', 'nosniff');
  return headers;
}

function contentTypeFromPublicKey(publicKey: string): CatalogImageContentType {
  if (publicKey.endsWith('.jpg')) return 'image/jpeg';
  if (publicKey.endsWith('.png')) return 'image/png';
  return 'image/webp';
}

function signatureMatches(bytes: Uint8Array, contentType: CatalogImageContentType): boolean {
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  return (
    bytes.length >= 12 &&
    textAt(bytes, 0, 4) === 'RIFF' &&
    textAt(bytes, 8, 12) === 'WEBP'
  );
}

function textAt(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

async function readBoundedBytes(request: Request, maximumBytes: number): Promise<Uint8Array> {
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw imageTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function imageTooLarge(): HttpError {
  return new HttpError(
    413,
    'IMAGE_TOO_LARGE',
    'La imagen no puede superar 4 MiB.',
  );
}
