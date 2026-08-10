import type {
  R2Bucket,
  R2HttpMetadata,
  R2Object,
  R2ObjectBody,
} from '../platform';

type StoredObject = Readonly<{
  bytes: Uint8Array;
  httpMetadata: R2HttpMetadata;
}>;

export class MemoryR2Bucket implements R2Bucket {
  readonly deletedKeys: string[] = [];
  readonly #objects = new Map<string, StoredObject>();

  get keys(): readonly string[] {
    return [...this.#objects.keys()];
  }

  delete(key: string): Promise<void> {
    this.deletedKeys.push(key);
    this.#objects.delete(key);
    return Promise.resolve();
  }

  get(key: string): Promise<R2ObjectBody | null> {
    const stored = this.#objects.get(key);
    if (stored === undefined) return Promise.resolve(null);
    const object = this.#object(key, stored);
    const bytes = stored.bytes.slice();
    return Promise.resolve({
      ...object,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    });
  }

  head(key: string): Promise<R2Object | null> {
    const stored = this.#objects.get(key);
    return Promise.resolve(stored === undefined ? null : this.#object(key, stored));
  }

  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: Readonly<{ httpMetadata?: R2HttpMetadata }>,
  ): Promise<R2Object> {
    const source = value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const stored = Object.freeze({
      bytes: source.slice(),
      httpMetadata: Object.freeze({ ...(options?.httpMetadata ?? {}) }),
    });
    this.#objects.set(key, stored);
    return Promise.resolve(this.#object(key, stored));
  }

  #object(key: string, stored: StoredObject): R2Object {
    const httpEtag = `"test-${stored.bytes.byteLength}"`;
    return Object.freeze({
      key,
      size: stored.bytes.byteLength,
      httpEtag,
      httpMetadata: stored.httpMetadata,
      writeHttpMetadata: (headers: Headers) => {
        if (stored.httpMetadata.cacheControl !== undefined) {
          headers.set('cache-control', stored.httpMetadata.cacheControl);
        }
        if (stored.httpMetadata.contentType !== undefined) {
          headers.set('content-type', stored.httpMetadata.contentType);
        }
      },
    });
  }
}
