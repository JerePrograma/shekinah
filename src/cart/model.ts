import { isProductEffectivelyAvailable } from '../catalog/model';
import type { Product } from '../catalog/model';
import { MAX_CART_LINES, MAX_CART_QUANTITY } from '../commerce/contracts';

export { MAX_CART_LINES, MAX_CART_QUANTITY } from '../commerce/contracts';

export const CART_STORAGE_KEY = 'shekinah.cart.v1';
export const CART_VERSION = 1 as const;

export type StoredCartLine = Readonly<{
  productId: string;
  quantity: number;
}>;

export type StoredCart = Readonly<{
  version: typeof CART_VERSION;
  items: readonly StoredCartLine[];
  updatedAt: string;
}>;

export type CartItem = Readonly<{
  product: Product;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}>;

export type CartSummary = Readonly<{
  items: readonly CartItem[];
  itemCount: number;
  total: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isProductAvailable(product: Product): boolean {
  return isProductEffectivelyAvailable(product);
}

export function getProductCartLimit(product: Product): number {
  if (!isProductAvailable(product)) return 0;
  return Math.min(
    MAX_CART_QUANTITY,
    product.availableQuantity ?? product.stockQuantity ?? MAX_CART_QUANTITY,
  );
}

function normalizeQuantity(value: unknown, maximum = MAX_CART_QUANTITY): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 1 || value > maximum) return null;
  return value;
}

export function emptyCart(now = new Date()): StoredCart {
  return Object.freeze({
    version: CART_VERSION,
    items: Object.freeze([]),
    updatedAt: now.toISOString(),
  });
}

export function parseStoredCart(
  value: unknown,
  products: readonly Product[],
  now = new Date(),
): StoredCart {
  if (!isRecord(value) || value.version !== CART_VERSION || !Array.isArray(value.items)) {
    return emptyCart(now);
  }
  const availableProducts = new Map(
    products.filter(isProductAvailable).map((product) => [product.id, product]),
  );
  const quantities = new Map<string, number>();
  for (const candidate of value.items) {
    if (quantities.size >= MAX_CART_LINES) break;
    if (!isRecord(candidate) || typeof candidate.productId !== 'string') continue;
    const product = availableProducts.get(candidate.productId);
    if (product === undefined) continue;
    const maximum = getProductCartLimit(product);
    const quantity = normalizeQuantity(candidate.quantity, MAX_CART_QUANTITY);
    if (quantity === null) continue;
    quantities.set(
      candidate.productId,
      Math.min((quantities.get(candidate.productId) ?? 0) + quantity, maximum),
    );
  }
  return Object.freeze({
    version: CART_VERSION,
    items: Object.freeze(
      [...quantities.entries()].map(([productId, quantity]) =>
        Object.freeze({ productId, quantity }),
      ),
    ),
    updatedAt:
      typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt))
        ? value.updatedAt
        : now.toISOString(),
  });
}

export function parseStoredCartJson(
  serialized: string | null,
  products: readonly Product[],
  now = new Date(),
): StoredCart {
  if (serialized === null) return emptyCart(now);
  try {
    return parseStoredCart(JSON.parse(serialized) as unknown, products, now);
  } catch {
    return emptyCart(now);
  }
}

export function serializeCart(cart: StoredCart): string {
  return JSON.stringify(cart);
}

export function addCartItem(
  cart: StoredCart,
  productId: string,
  quantity = 1,
  maximumQuantityOrNow: number | Date = MAX_CART_QUANTITY,
  now = new Date(),
): StoredCart {
  const maximumQuantity = maximumQuantityOrNow instanceof Date
    ? MAX_CART_QUANTITY
    : maximumQuantityOrNow;
  const effectiveNow = maximumQuantityOrNow instanceof Date ? maximumQuantityOrNow : now;
  const normalizedQuantity = normalizeQuantity(quantity, maximumQuantity);
  if (normalizedQuantity === null) return cart;
  const existing = cart.items.find((item) => item.productId === productId);
  if (existing === undefined && cart.items.length >= MAX_CART_LINES) return cart;
  const nextQuantity = Math.min(
    (existing?.quantity ?? 0) + normalizedQuantity,
    maximumQuantity,
  );
  if (existing?.quantity === nextQuantity) return cart;
  return Object.freeze({
    version: CART_VERSION,
    items: Object.freeze([
      ...cart.items.filter((item) => item.productId !== productId),
      Object.freeze({ productId, quantity: nextQuantity }),
    ]),
    updatedAt: effectiveNow.toISOString(),
  });
}

export function setCartItemQuantity(
  cart: StoredCart,
  productId: string,
  quantity: number,
  maximumQuantityOrNow: number | Date = MAX_CART_QUANTITY,
  now = new Date(),
): StoredCart {
  const maximumQuantity = maximumQuantityOrNow instanceof Date
    ? MAX_CART_QUANTITY
    : maximumQuantityOrNow;
  const effectiveNow = maximumQuantityOrNow instanceof Date ? maximumQuantityOrNow : now;
  const normalizedQuantity = normalizeQuantity(quantity, maximumQuantity);
  if (normalizedQuantity === null || !cart.items.some((item) => item.productId === productId)) {
    return cart;
  }
  return Object.freeze({
    version: CART_VERSION,
    items: Object.freeze(
      cart.items.map((item) =>
        item.productId === productId
          ? Object.freeze({ productId, quantity: normalizedQuantity })
          : item,
      ),
    ),
    updatedAt: effectiveNow.toISOString(),
  });
}

export function removeCartItem(
  cart: StoredCart,
  productId: string,
  now = new Date(),
): StoredCart {
  if (!cart.items.some((item) => item.productId === productId)) return cart;
  return Object.freeze({
    version: CART_VERSION,
    items: Object.freeze(cart.items.filter((item) => item.productId !== productId)),
    updatedAt: now.toISOString(),
  });
}

export function clearCart(cart: StoredCart, now = new Date()): StoredCart {
  if (cart.items.length === 0) return cart;
  return emptyCart(now);
}

export function summarizeCart(
  cart: StoredCart,
  products: readonly Product[],
): CartSummary {
  const productById = new Map(products.map((product) => [product.id, product]));
  const items = cart.items.flatMap((line): readonly CartItem[] => {
    const product = productById.get(line.productId);
    if (product === undefined || !isProductAvailable(product)) return [];
    const unitPrice = (product.salePrice ?? product.price).amount;
    return [
      Object.freeze({
        product,
        quantity: line.quantity,
        unitPrice,
        subtotal: unitPrice * line.quantity,
      }),
    ];
  });
  return Object.freeze({
    items: Object.freeze(items),
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    total: items.reduce((total, item) => total + item.subtotal, 0),
  });
}

export function cartLineFingerprint(
  lines: readonly Readonly<{ productId: string; quantity: number }>[],
): string {
  return lines
    .map(({ productId, quantity }) => `${productId}:${quantity}`)
    .sort()
    .join('|');
}
