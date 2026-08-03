import generatedCatalog from './generated/catalog.json';
import { MAX_CART_LINES, MAX_CART_QUANTITY } from '../src/commerce/contracts';
import {
  calculateShippingQuote,
} from '../src/commerce/fulfillment';
import type {
  CheckoutFulfillment,
  ShippingTier,
} from '../src/commerce/fulfillment';
import { requireCheckoutFulfillment } from './fulfillment';
import { HttpError } from './http';
import { assertExactKeys, isRecord, readInteger, readSafeText } from './validation';

export type ServerCatalogProduct = Readonly<{
  id: string;
  name: string;
  presentation?: string;
  sku?: string;
  unitPriceMinor: number;
  available: boolean;
}>;

export type RecalculatedLine = Readonly<{
  product: ServerCatalogProduct;
  quantity: number;
  subtotalMinor: number;
}>;

export type RecalculatedCart = Readonly<{
  lines: readonly RecalculatedLine[];
  currency: 'ARS';
  itemCount: number;
  productsTotalMinor: number;
  shippingMinor: number;
  shippingTier: Exclude<ShippingTier, 'manual_unknown_weight' | 'manual_over_5kg'>;
  totalWeightGrams: number | null;
  fulfillment: CheckoutFulfillment;
  totalMinor: number;
}>;

const catalog = parseGeneratedCatalog(generatedCatalog);
const catalogById = new Map(catalog.map((product) => [product.id, product]));

export function getServerCatalog(): readonly ServerCatalogProduct[] {
  return catalog;
}

export function recalculateCart(value: unknown): RecalculatedCart {
  if (!isRecord(value)) {
    throw new HttpError(400, 'INVALID_CHECKOUT', 'La solicitud de checkout no es válida.');
  }
  assertExactKeys(
    value,
    ['idempotencyKey', 'items', 'fulfillment'],
    'INVALID_CHECKOUT',
    'La solicitud de checkout contiene campos no permitidos.',
  );
  const fulfillment = requireCheckoutFulfillment(value.fulfillment);
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_CART_LINES) {
    throw new HttpError(400, 'INVALID_CART', 'El carrito no contiene una cantidad válida de productos.');
  }
  const seen = new Set<string>();
  const lines: RecalculatedLine[] = [];
  let productsTotalMinor = 0;
  let itemCount = 0;

  for (const rawLine of value.items) {
    if (!isRecord(rawLine)) {
      throw new HttpError(400, 'INVALID_CART_LINE', 'Una línea del carrito no es válida.');
    }
    assertExactKeys(
      rawLine,
      ['productId', 'quantity'],
      'INVALID_CART_LINE',
      'Una línea del carrito contiene campos no permitidos.',
    );
    const productId = readSafeText(rawLine.productId, 'productId', 180);
    const quantity = readInteger(rawLine.quantity, 'quantity', 1, MAX_CART_QUANTITY);
    if (seen.has(productId)) {
      throw new HttpError(400, 'DUPLICATE_PRODUCT', 'El carrito contiene un producto duplicado.');
    }
    seen.add(productId);
    const product = catalogById.get(productId);
    if (product === undefined) {
      throw new HttpError(400, 'PRODUCT_NOT_FOUND', 'Uno de los productos ya no existe.');
    }
    if (!product.available) {
      throw new HttpError(409, 'PRODUCT_UNAVAILABLE', 'Uno de los productos ya no está disponible.');
    }
    const subtotalMinor = product.unitPriceMinor * quantity;
    if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor <= 0) {
      throw new HttpError(500, 'CATALOG_PRICE_INVALID', 'El catálogo contiene un precio no válido.', false);
    }
    productsTotalMinor += subtotalMinor;
    itemCount += quantity;
    if (!Number.isSafeInteger(productsTotalMinor) || !Number.isSafeInteger(itemCount)) {
      throw new HttpError(400, 'CART_TOTAL_OUT_OF_RANGE', 'El carrito excede los límites permitidos.');
    }
    lines.push(Object.freeze({ product, quantity, subtotalMinor }));
  }

  const quote = calculateShippingQuote(
    lines.map(({ product, quantity }) => ({
      name: product.name,
      ...(product.presentation === undefined ? {} : { presentation: product.presentation }),
      quantity,
    })),
    fulfillment.method,
  );
  if (quote.kind === 'manual') {
    throw new HttpError(
      409,
      quote.tier === 'manual_unknown_weight'
        ? 'MANUAL_SHIPPING_WEIGHT_REQUIRED'
        : 'MANUAL_SHIPPING_OVER_LIMIT',
      quote.tier === 'manual_unknown_weight'
        ? 'Uno de los productos no tiene un peso determinístico. Solicitá la cotización por WhatsApp.'
        : 'El pedido supera los 5 kg. Solicitá la cotización por WhatsApp.',
    );
  }
  const totalMinor = productsTotalMinor + quote.shippingMinor;
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    throw new HttpError(400, 'CART_TOTAL_OUT_OF_RANGE', 'El total del pedido excede los límites permitidos.');
  }

  return Object.freeze({
    lines: Object.freeze(lines),
    currency: 'ARS',
    itemCount,
    productsTotalMinor,
    shippingMinor: quote.shippingMinor,
    shippingTier: quote.tier,
    totalWeightGrams: quote.totalWeightGrams,
    fulfillment,
    totalMinor,
  });
}

export function toMajorUnits(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(500, 'INVALID_MINOR_AMOUNT', 'El importe interno no es válido.', false);
  }
  return value / 100;
}

function parseGeneratedCatalog(value: unknown): readonly ServerCatalogProduct[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10_000) {
    throw new Error('El catálogo generado para Functions no es válido.');
  }
  const seen = new Set<string>();
  const products = value.map((candidate): ServerCatalogProduct => {
    if (!isRecord(candidate)) throw new Error('Producto generado inválido.');
    const keys = Object.keys(candidate);
    if (keys.some((key) => !['id', 'name', 'presentation', 'sku', 'unitPriceMinor', 'available'].includes(key))) {
      throw new Error('El catálogo generado contiene campos no autorizados.');
    }
    if (
      typeof candidate.id !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{0,179}$/u.test(candidate.id) ||
      typeof candidate.name !== 'string' ||
      candidate.name.trim() === '' ||
      candidate.name.length > 300 ||
      typeof candidate.unitPriceMinor !== 'number' ||
      !Number.isSafeInteger(candidate.unitPriceMinor) ||
      candidate.unitPriceMinor <= 0 ||
      typeof candidate.available !== 'boolean' ||
      (candidate.presentation !== undefined &&
        (typeof candidate.presentation !== 'string' || candidate.presentation.length > 160)) ||
      (candidate.sku !== undefined &&
        (typeof candidate.sku !== 'string' || candidate.sku.length > 160))
    ) {
      throw new Error('El catálogo generado contiene un producto inválido.');
    }
    if (seen.has(candidate.id)) throw new Error('El catálogo generado contiene IDs duplicados.');
    seen.add(candidate.id);
    return Object.freeze({
      id: candidate.id,
      name: candidate.name,
      ...(candidate.presentation === undefined ? {} : { presentation: candidate.presentation }),
      ...(candidate.sku === undefined ? {} : { sku: candidate.sku }),
      unitPriceMinor: candidate.unitPriceMinor,
      available: candidate.available,
    });
  });
  return Object.freeze(products);
}
