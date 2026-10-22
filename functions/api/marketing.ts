import { readDuxCatalogSnapshot } from '../../server/dux-catalog';
import { readDuxCatalogControl, requireExpectedDuxCompany } from '../../server/dux-catalog-control';
import { readDuxSnapshotMaxAgeSeconds } from '../../server/config';
import { assertDuxProductsPublished } from '../../server/dux-product-web-settings';
import { HttpError, jsonResponse, methodNotAllowedResponse, requireDatabase, responseFromError } from '../../server/http';
import { consumeMarketingCouponAttempt, readMarketingQuote, readPublicMarketing } from '../../server/marketing';
import type { PagesFunction } from '../../server/platform';
import { assertExactKeys, assertSameOrigin, isRecord, readInteger, readJsonBody, readSafeText } from '../../server/validation';

export const onRequest: PagesFunction = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'POST') return methodNotAllowedResponse(['GET','POST']);
  try {
    const database = requireDatabase(env);
    if (request.method === 'GET') return jsonResponse(await readPublicMarketing(database));
    assertSameOrigin(request, env);
    const input = await readJsonBody(request);
    if (!isRecord(input)) throw new HttpError(400,'INVALID_REQUEST','El carrito no es válido.');
    assertExactKeys(input,['items','couponCode']);
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 99 ||
        (input.couponCode !== undefined && input.couponCode !== null && typeof input.couponCode !== 'string')) {
      throw new HttpError(400,'INVALID_REQUEST','El carrito o el cupón no son válidos.');
    }
    if (typeof input.couponCode === 'string' && input.couponCode.trim() !== '') {
      await consumeMarketingCouponAttempt(database,request,env.ORDER_TOKEN_SECRET);
    }
    requireExpectedDuxCompany(env);
    if (!(await readDuxCatalogControl(database)).publicCatalogEnabled) throw new HttpError(503,'CATALOG_UNAVAILABLE','El catálogo no está disponible temporalmente.');
    const snapshot = await readDuxCatalogSnapshot(database);
    const observed = Date.parse(snapshot.stockReadAt ?? snapshot.syncedAt), now = Date.now();
    if (!Number.isFinite(observed) || observed > now + 60000 || now - observed > readDuxSnapshotMaxAgeSeconds(env) * 1000) {
      throw new HttpError(409,'CATALOG_STALE','El catálogo necesita actualizar sus precios antes de cotizar promociones.');
    }
    const lines = input.items.map(value => {
      if (!isRecord(value)) throw new HttpError(400,'INVALID_REQUEST','El producto no es válido.');
      assertExactKeys(value,['productId','quantity','catalogVersion']);
      const productId = readSafeText(value.productId,'productId',200), quantity = readInteger(value.quantity,'quantity',1,99);
      if (value.catalogVersion !== snapshot.catalogVersion) throw new HttpError(409,'CATALOG_CHANGED','El catálogo cambió. Actualizá el carrito.');
      const product = snapshot.items.find(item => item.slug === productId);
      if (product === undefined || product.priceStatus !== 'usable' || product.priceAmount === null || product.priceAmount <= 0) {
        throw new HttpError(409,'PRODUCT_UNAVAILABLE','Un producto no tiene precio vigente. Revisá el carrito.');
      }
      const unitPriceMinor = Math.round(product.priceAmount * 100);
      if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor < 1) throw new HttpError(409,'PRODUCT_UNAVAILABLE','El precio de un producto no está disponible.');
      return { productId,code: product.code,quantity,unitPriceMinor };
    });
    if (new Set(lines.map(line => line.productId)).size !== lines.length) throw new HttpError(400,'INVALID_REQUEST','El carrito contiene productos repetidos.');
    await assertDuxProductsPublished(database,lines.map(line => line.code));
    return jsonResponse({ quote: await readMarketingQuote(database,lines,input.couponCode) });
  } catch (error: unknown) { return responseFromError(error); }
};
