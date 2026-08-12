import type { CartItem } from '../cart/model';
import { cartLineFingerprint } from '../cart/model';
import { CHECKOUT_IDEMPOTENCY_WINDOW_MS } from './contracts';
import { fulfillmentCanonicalValue } from './fulfillment';
import type { CheckoutFulfillment } from './fulfillment';

const IDEMPOTENCY_STORAGE_KEY = 'shekinah.checkout-idempotency.v2';
const WHATSAPP_IDEMPOTENCY_STORAGE_KEY = 'shekinah.whatsapp-order-idempotency.v1';
const ORDER_STORAGE_KEY = 'shekinah.checkout-order.v1';
const CHECKOUT_LOCK_NAME = 'shekinah.checkout-idempotency';
const WHATSAPP_LOCK_NAME = 'shekinah.whatsapp-order-idempotency';
const ORDER_MEMORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const volatileAttempts = new Map<string, StoredCheckoutAttempt>();

type StoredCheckoutAttempt = Readonly<{
  fingerprintHash: string;
  idempotencyKey: string;
  createdAt: number;
}>;

type StoredOrderAttempt = Readonly<{
  publicToken: string;
  fingerprint: string;
  createdAt: number;
}>;

type LockManagerLike = Readonly<{
  request: <T>(
    name: string,
    options: Readonly<{ mode: 'exclusive' }>,
    callback: () => T | Promise<T>,
  ) => Promise<T>;
}>;

export async function checkoutFingerprint(
  items: readonly CartItem[],
  fulfillment: CheckoutFulfillment,
): Promise<string> {
  const canonical = JSON.stringify([
    cartFingerprint(items),
    fulfillmentCanonicalValue(fulfillment),
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function getOrCreateCheckoutIdempotencyKey(
  items: readonly CartItem[],
  fulfillment: CheckoutFulfillment,
  now = Date.now(),
): Promise<string> {
  const operation = () => getOrCreateCheckoutIdempotencyKeyUnlocked(items, fulfillment, now);
  const lockManager = readLockManager();
  if (lockManager === null) return operation();
  return lockManager.request(CHECKOUT_LOCK_NAME, { mode: 'exclusive' }, operation);
}

export async function getOrCreateWhatsappOrderIdempotencyKey(
  items: readonly CartItem[],
  fulfillment: CheckoutFulfillment | null,
  now = Date.now(),
): Promise<string> {
  const operation = async () => getOrCreateIdempotencyKey(
    WHATSAPP_IDEMPOTENCY_STORAGE_KEY,
    await whatsappOrderFingerprint(items, fulfillment),
    now,
  );
  const lockManager = readLockManager();
  if (lockManager === null) return operation();
  return lockManager.request(WHATSAPP_LOCK_NAME, { mode: 'exclusive' }, operation);
}

export function rememberCheckoutOrder(
  publicToken: string,
  items: readonly CartItem[],
  now = Date.now(),
): void {
  if (!/^[a-f0-9]{64}$/iu.test(publicToken)) return;
  writeSessionJson(ORDER_STORAGE_KEY, {
    publicToken: publicToken.toLocaleLowerCase('en'),
    fingerprint: cartFingerprint(items),
    createdAt: now,
  });
}

export function readRememberedCheckoutOrder(now = Date.now()): StoredOrderAttempt | null {
  const value = readSessionJson<StoredOrderAttempt>(ORDER_STORAGE_KEY);
  if (
    value === null ||
    !/^[a-f0-9]{64}$/iu.test(value.publicToken) ||
    typeof value.fingerprint !== 'string' ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    now - value.createdAt < 0 ||
    now - value.createdAt > ORDER_MEMORY_WINDOW_MS
  ) {
    return null;
  }
  return value;
}

export function shouldClearCartAfterApproval(
  items: readonly CartItem[],
  publicToken: string,
): boolean {
  const remembered = readRememberedCheckoutOrder();
  return (
    remembered !== null &&
    remembered.publicToken === publicToken.toLocaleLowerCase('en') &&
    remembered.fingerprint === cartFingerprint(items)
  );
}

export function clearCheckoutAttempt(): void {
  volatileAttempts.delete(IDEMPOTENCY_STORAGE_KEY);
  try {
    window.localStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
  } catch {
    // El servidor conserva la idempotencia aunque no se pueda limpiar el navegador.
  }
}

export function clearRememberedCheckoutOrder(): void {
  try {
    window.sessionStorage.removeItem(ORDER_STORAGE_KEY);
  } catch {
    // El servidor mantiene la autoridad del pedido.
  }
  clearCheckoutAttempt();
}

async function getOrCreateCheckoutIdempotencyKeyUnlocked(
  items: readonly CartItem[],
  fulfillment: CheckoutFulfillment,
  now: number,
): Promise<string> {
  const fingerprintHash = await checkoutFingerprint(items, fulfillment);
  return getOrCreateIdempotencyKey(IDEMPOTENCY_STORAGE_KEY, fingerprintHash, now);
}

async function whatsappOrderFingerprint(
  items: readonly CartItem[],
  fulfillment: CheckoutFulfillment | null,
): Promise<string> {
  const canonical = JSON.stringify([
    cartFingerprint(items),
    fulfillment === null ? null : fulfillmentCanonicalValue(fulfillment),
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function getOrCreateIdempotencyKey(
  storageKey: string,
  fingerprintHash: string,
  now: number,
): string {
  const stored = readLocalJson<StoredCheckoutAttempt>(storageKey);
  if (isReusableAttempt(stored, fingerprintHash, now)) {
    volatileAttempts.set(storageKey, stored);
    return stored.idempotencyKey;
  }
  const volatile = volatileAttempts.get(storageKey) ?? null;
  if (isReusableAttempt(volatile, fingerprintHash, now)) return volatile.idempotencyKey;

  const candidate: StoredCheckoutAttempt = Object.freeze({
    fingerprintHash,
    idempotencyKey: crypto.randomUUID(),
    createdAt: now,
  });
  volatileAttempts.set(storageKey, candidate);
  writeLocalJson(storageKey, candidate);
  const persisted = readLocalJson<StoredCheckoutAttempt>(storageKey);
  if (!isReusableAttempt(persisted, fingerprintHash, now)) return candidate.idempotencyKey;
  volatileAttempts.set(storageKey, persisted);
  return persisted.idempotencyKey;
}

function isReusableAttempt(
  value: StoredCheckoutAttempt | null,
  fingerprintHash: string,
  now: number,
): value is StoredCheckoutAttempt {
  return (
    value !== null &&
    value.fingerprintHash === fingerprintHash &&
    /^[a-f0-9]{64}$/u.test(value.fingerprintHash) &&
    isUuid(value.idempotencyKey) &&
    Number.isFinite(value.createdAt) &&
    now - value.createdAt >= 0 &&
    now - value.createdAt <= CHECKOUT_IDEMPOTENCY_WINDOW_MS
  );
}

function cartFingerprint(items: readonly CartItem[]): string {
  return cartLineFingerprint(
    items.map(({ product, quantity }) => ({ productId: product.id, quantity })),
  );
}

function readLockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const value = (navigator as Navigator & Readonly<{ locks?: LockManagerLike }>).locks;
  return value === undefined || typeof value.request !== 'function' ? null : value;
}

function readLocalJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function writeLocalJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // La idempotencia del servidor sigue vigente aunque el navegador no persista.
  }
}

function readSessionJson<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function writeSessionJson(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // La respuesta del servidor sigue siendo autoritativa.
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
