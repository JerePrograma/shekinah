import { MAX_CART_LINES, MAX_CART_QUANTITY } from '../src/commerce/contracts';
import { isProductEffectivelyAvailable } from '../src/catalog/model';
import { calculateShippingQuote } from '../src/commerce/fulfillment';
import { getRuntimeCatalogProductDetail } from './catalog-store';
import type { RecalculatedCart, RecalculatedLine, ServerCatalogProduct } from './catalog';
import { requireCheckoutFulfillment } from './fulfillment';
import { HttpError } from './http';
import type { D1Database, Env } from './platform';
import { assertExactKeys, isRecord, readInteger, readSafeText } from './validation';

export async function recalculateDynamicCart(
  value: unknown,
  database: D1Database,
  env: Env = {},
  excludedReservationOrderId: string | null = null,
): Promise<RecalculatedCart> {
  if (!isRecord(value)) throw new HttpError(400, 'INVALID_CHECKOUT', 'La solicitud de checkout no es válida.');
  assertExactKeys(value, ['idempotencyKey', 'items', 'fulfillment'], 'INVALID_CHECKOUT', 'La solicitud de checkout contiene campos no permitidos.');
  const fulfillment = requireCheckoutFulfillment(value.fulfillment);
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_CART_LINES) throw new HttpError(400, 'INVALID_CART', 'El carrito no contiene una cantidad válida de productos.');
  const seen = new Set<string>(); const lines: RecalculatedLine[] = []; let productsTotalMinor = 0; let itemCount = 0;
  for (const rawLine of value.items) {
    if (!isRecord(rawLine)) throw new HttpError(400, 'INVALID_CART_LINE', 'Una línea del carrito no es válida.');
    assertExactKeys(rawLine, ['productId', 'quantity', 'catalogVersion'], 'INVALID_CART_LINE', 'Una línea del carrito contiene campos no permitidos.');
    const productId = readSafeText(rawLine.productId, 'productId', 180);
    const quantity = readInteger(rawLine.quantity, 'quantity', 1, MAX_CART_QUANTITY);
    if (seen.has(productId)) throw new HttpError(400, 'DUPLICATE_PRODUCT', 'El carrito contiene un producto duplicado.');
    seen.add(productId);
    const detail = await getRuntimeCatalogProductDetail(
      database,
      env,
      productId,
      excludedReservationOrderId,
    );
    if (detail === null) throw new HttpError(400, 'PRODUCT_NOT_FOUND', 'Uno de los productos ya no existe.');
    if (detail.availability === 'unavailable') throw new HttpError(409, 'PRODUCT_UNAVAILABLE', 'Uno de los productos ya no está disponible.');
    const availableQuantity = detail.availableQuantity ?? detail.stockQuantity;
    if (availableQuantity !== undefined && quantity > availableQuantity) throw new HttpError(409, 'INSUFFICIENT_STOCK', `No hay stock suficiente para ${detail.name}.`);
    const available = isProductEffectivelyAvailable(detail);
    const expectedCatalogVersion = rawLine.catalogVersion === undefined
      ? null
      : readSafeText(rawLine.catalogVersion, 'catalogVersion', 64);
    if (env.MERCADO_LIBRE_CATALOG_ENABLED === 'true') {
      if (
        detail.commerce === undefined ||
        expectedCatalogVersion === null ||
        !/^[a-f0-9]{64}$/u.test(expectedCatalogVersion)
      ) {
        throw new HttpError(409, 'CATALOG_VERSION_REQUIRED', 'Actualizá el carrito antes de continuar.');
      }
      if (expectedCatalogVersion !== detail.commerce.catalogVersion) {
        throw new HttpError(409, 'CATALOG_VERSION_CONFLICT', `${detail.name} cambió desde que se agregó al carrito.`);
      }
      if (!detail.commerce.checkoutEligible) {
        throw new HttpError(409, 'MERCADO_LIBRE_STOCK_UNPROTECTED', `${detail.name} requiere confirmación de disponibilidad.`);
      }
    }
    const unitPriceMinor = Math.round((detail.salePrice ?? detail.price).amount * 100);
    if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor <= 0) throw new HttpError(500, 'CATALOG_PRICE_INVALID', 'El catálogo contiene un precio no válido.', false);
    const product: ServerCatalogProduct = Object.freeze({ id: detail.id, name: detail.name, ...(detail.presentation === undefined ? {} : { presentation: detail.presentation }), ...(detail.sku === undefined ? {} : { sku: detail.sku }), unitPriceMinor, available, stockControlled: detail.commerce === undefined && detail.stockQuantity !== undefined, ...(detail.commerce === undefined ? {} : { providerCatalogVersion: detail.commerce.catalogVersion }) });
    const subtotalMinor = unitPriceMinor * quantity;
    if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor <= 0) throw new HttpError(500, 'CATALOG_PRICE_INVALID', 'El catálogo contiene un precio no válido.', false);
    productsTotalMinor += subtotalMinor; itemCount += quantity;
    if (!Number.isSafeInteger(productsTotalMinor) || !Number.isSafeInteger(itemCount)) throw new HttpError(400, 'CART_TOTAL_OUT_OF_RANGE', 'El carrito excede los límites permitidos.');
    lines.push(Object.freeze({ product, quantity, subtotalMinor }));
  }
  const quote = calculateShippingQuote(lines.map(({ product, quantity }) => ({ name: product.name, ...(product.presentation === undefined ? {} : { presentation: product.presentation }), quantity })), fulfillment.method);
  if (quote.kind === 'manual') throw new HttpError(409, quote.tier === 'manual_unknown_weight' ? 'MANUAL_SHIPPING_WEIGHT_REQUIRED' : 'MANUAL_SHIPPING_OVER_LIMIT', quote.tier === 'manual_unknown_weight' ? 'Uno de los productos no tiene un peso determinístico. Solicitá la cotización por WhatsApp.' : 'El pedido supera los 5 kg. Solicitá la cotización por WhatsApp.');
  const totalMinor = productsTotalMinor + quote.shippingMinor;
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) throw new HttpError(400, 'CART_TOTAL_OUT_OF_RANGE', 'El total del pedido excede los límites permitidos.');
  return Object.freeze({ lines: Object.freeze(lines), currency: 'ARS', itemCount, productsTotalMinor, shippingMinor: quote.shippingMinor, shippingTier: quote.tier, totalWeightGrams: quote.totalWeightGrams, fulfillment, totalMinor });
}
