function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

export function randomToken(byteLength = 32): string {
  if (!Number.isSafeInteger(byteLength) || byteLength < 16 || byteLength > 128) {
    throw new RangeError('Longitud de token fuera de rango.');
  }
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return encodeBase64Url(bytes);
}

export async function sha256Bytes(value: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes)),
  );
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  return bytesToHex(await sha256Bytes(value));
}

export async function hmacSha256Bytes(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
  );
}

export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  return bytesToHex(await hmacSha256Bytes(secret, value));
}

export async function verifyHmacSha256Hex(
  secret: string,
  value: string,
  receivedHex: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/iu.test(receivedHex)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    toArrayBuffer(hexToBytes(receivedHex)),
    new TextEncoder().encode(value),
  );
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const maximum = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < maximum; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function encodeBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) throw new Error('Base64url inválido.');
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export type EncryptedSecret = Readonly<{
  ciphertext: string;
  iv: string;
}>;

export async function encryptSecret(
  plaintext: string,
  base64UrlKey: string,
): Promise<EncryptedSecret> {
  const key = await importAesKey(base64UrlKey, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    new TextEncoder().encode(plaintext),
  ));
  return Object.freeze({
    ciphertext: encodeBase64Url(ciphertext),
    iv: encodeBase64Url(iv),
  });
}

export async function decryptSecret(
  encrypted: EncryptedSecret,
  base64UrlKey: string,
): Promise<string> {
  const key = await importAesKey(base64UrlKey, ['decrypt']);
  const iv = decodeBase64Url(encrypted.iv);
  if (iv.byteLength !== 12) throw new Error('IV cifrado inválido.');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(decodeBase64Url(encrypted.ciphertext)),
  );
  return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
}

async function importAesKey(
  base64UrlKey: string,
  usages: readonly KeyUsage[],
): Promise<CryptoKey> {
  const bytes = decodeBase64Url(base64UrlKey);
  if (bytes.byteLength !== 32) throw new Error('Clave de cifrado inválida.');
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(bytes),
    { name: 'AES-GCM' },
    false,
    [...usages],
  );
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}
