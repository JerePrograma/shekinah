import { CATALOG_IMAGE_CACHE_CONTROL, readCatalogImageUpload, requireCatalogImageBucket } from './catalog-images';
import { HttpError } from './http';
import { validateEditorialImageUrl, type EditorialPicture } from './mercado-libre-editorial-policy';
import { editorialError, type ImportedEditorialImage } from './mercado-libre-editorial-store';
import type { Env } from './platform';

export async function importEditorialImage(env: Env, picture: EditorialPicture, productName: string): Promise<ImportedEditorialImage | null> {
  const url = validateEditorialImageUrl(picture.url);
  let response: Response;
  try { response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
  catch { throw editorialError('ML_EDITORIAL_IMAGE_UNAVAILABLE', 503); }
  if (response.status === 404 || response.status === 410) { await response.body?.cancel(); return null; }
  if (!response.ok) { await response.body?.cancel(); throw editorialError('ML_EDITORIAL_IMAGE_UNAVAILABLE', 503); }
  const init = { method: 'POST', headers: response.headers, body: response.body, duplex: 'half' };
  let upload;
  try { upload = await readCatalogImageUpload(new Request('https://editorial-validation.invalid/', init)); }
  catch (error: unknown) {
    if (error instanceof HttpError && [400, 413, 415].includes(error.status)) return null;
    throw editorialError('ML_EDITORIAL_IMAGE_UNAVAILABLE', 503);
  }
  const hash = await digestBytes(upload.bytes);
  const key = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-${(8 + Number.parseInt(hash[16] ?? '0',16) % 4).toString(16)}${hash.slice(17,20)}-${hash.slice(20,32)}.${upload.extension}`;
  const bucket = requireCatalogImageBucket(env);
  const stored = await bucket.head(`products/${key}`);
  if (stored === null) {
    const result = await bucket.put(`products/${key}`, upload.bytes, { httpMetadata: { contentType: upload.contentType, cacheControl: CATALOG_IMAGE_CACHE_CONTROL } });
    if (result === null) throw editorialError('ML_EDITORIAL_IMAGE_STORAGE_FAILED', 503);
  } else {
    const existing = await bucket.get(`products/${key}`);
    if (existing === null || existing.size !== upload.bytes.byteLength || existing.httpMetadata.contentType !== upload.contentType) throw editorialError('ML_EDITORIAL_IMAGE_CONFLICT');
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of existing.body) { size += chunk.byteLength; if (size > upload.bytes.byteLength) throw editorialError('ML_EDITORIAL_IMAGE_CONFLICT'); chunks.push(chunk); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (await digestBytes(bytes) !== hash) throw editorialError('ML_EDITORIAL_IMAGE_CONFLICT');
  }
  return { src: `/api/catalog-images/${key}`, alt: productName, providerPictureId: picture.id, providerUrl: url,
    sha256: hash, bytes: upload.bytes.byteLength, contentType: upload.contentType };
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}
