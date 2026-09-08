import type { WebRequestIdentity } from './web-order-contracts';

const DATABASE = 'shekinah.web-requests.v1';
const STORE = 'attempts';
const KEY = 'active';

/** La transacción readwrite serializa pestañas. No guarda datos de entrega. */
export async function getOrCreateWebRequestIdentity(): Promise<WebRequestIdentity> {
  const result = await transaction(true, (store, current) => {
    if (current !== null) return current;
    const ownerSecret = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const created = Object.freeze({ idempotencyKey: crypto.randomUUID(), ownerSecret });
    store.put(created, KEY);
    return created;
  });
  if (result === null) throw storageError();
  return result;
}

export function readWebRequestIdentity(): Promise<WebRequestIdentity | null> {
  return transaction(false, (_store, current) => current);
}

/** Sólo después de una resolución leída del servidor y un nuevo pedido deliberado. */
export async function finishWebRequestIdentity(expectedKey: string): Promise<void> {
  await transaction(true, (store, current) => {
    if (current?.idempotencyKey === expectedKey) {
      store.put(current, `history:${expectedKey}`);
      store.delete(KEY);
    }
    return null;
  });
}

async function transaction(write: boolean,
  operation: (store: IDBObjectStore, current: WebRequestIdentity | null) => WebRequestIdentity | null,
): Promise<WebRequestIdentity | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let result: WebRequestIdentity | null = null;
    let error: unknown;
    let tx: IDBTransaction;
    try { tx = db.transaction(STORE, write ? 'readwrite' : 'readonly'); }
    catch { db.close(); reject(storageError()); return; }
    const timer = window.setTimeout(() => { try { tx.abort(); } catch { /* La transacción pudo haber terminado. */ } }, 5000);
    const close = () => { window.clearTimeout(timer); db.close(); };
    tx.oncomplete = () => { close(); resolve(result); };
    tx.onabort = tx.onerror = () => { close(); reject(error instanceof Error ? error : storageError()); };
    const store = tx.objectStore(STORE);
    const request = store.get(KEY);
    request.onsuccess = () => {
      try { result = operation(store, parseIdentity(request.result)); }
      catch (failure: unknown) { error = failure; tx.abort(); }
    };
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(storageError()); return; }
    let settled = false;
    const timer = window.setTimeout(() => { settled = true; reject(storageError()); }, 5000);
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onerror = request.onblocked = () => {
      settled = true; window.clearTimeout(timer); reject(storageError());
    };
    request.onsuccess = () => {
      window.clearTimeout(timer);
      const db = request.result;
      db.onversionchange = () => db.close();
      if (settled) db.close(); else { settled = true; resolve(db); }
    };
  });
}

function parseIdentity(value: unknown): WebRequestIdentity | null {
  if (value === undefined) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw storageError();
  const item = value as Record<string, unknown>;
  if (typeof item.idempotencyKey !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(item.idempotencyKey) ||
      typeof item.ownerSecret !== 'string' || !/^[a-f0-9]{64}$/u.test(item.ownerSecret)) throw storageError();
  return Object.freeze({ idempotencyKey: item.idempotencyKey, ownerSecret: item.ownerSecret });
}

function storageError(): Error {
  return new Error('El navegador no pudo conservar la protección de la solicitud. No se enviará otra solicitud sin recuperar esa protección.');
}
