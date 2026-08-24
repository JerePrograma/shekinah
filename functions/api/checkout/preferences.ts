import { recalculateDynamicCart } from '../../../server/dynamic-cart';
import { requireCommerceMode, requireEnabledFlag, requirePublicSiteUrl } from '../../../server/config';
import { createPaymentCart, persistOrderFulfillment, reserveCheckoutIntent } from '../../../server/fulfillment';
import { HttpError, jsonResponse, methodNotAllowedResponse, requireDatabase, requireSecret, responseFromError } from '../../../server/http';
import { assertMercadoPagoPreferenceActive, createMercadoPagoPreference, recoverMercadoPagoPreference } from '../../../server/mercado-pago';
import { reconcileExpiredMercadoLibreReservations, releaseMercadoLibreInventory, reserveMercadoLibreInventory } from '../../../server/mercado-libre-inventory';
import { revalidateMercadoLibreCart } from '../../../server/mercado-libre-catalog';
import { listCatalogProductDetails } from '../../../server/catalog-store';
import { claimPreferenceAttempt, failOrderBeforePreference, getOrderByIdempotencyKey, markOrderFailed, markPreferenceCreated, prepareOrder, resetRetrySafeFailedOrder } from '../../../server/orders';
import type { PagesFunction } from '../../../server/platform';
import { expireWhatsappReservations } from '../../../server/stock-reservations';
import { assertExactKeys, assertSameOrigin, assertUuid, isRecord, readJsonBody } from '../../../server/validation';
export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    requireEnabledFlag(env.COMMERCE_ENABLED, 'COMMERCE_DISABLED', 'El checkout todavía no está habilitado.'); assertSameOrigin(request, env);
    const database = requireDatabase(env); const siteUrl = requirePublicSiteUrl(env);
    if (env.MERCADO_LIBRE_CATALOG_ENABLED === 'true') {
      await reconcileExpiredMercadoLibreReservations(database, env);
    } else {
      await expireWhatsappReservations(database);
    }
    const accessToken = requireSecret(env.MERCADO_PAGO_ACCESS_TOKEN, 'PAYMENT_CREDENTIALS_MISSING', 'Mercado Pago no está configurado.', 20);
    void requireSecret(env.MERCADO_PAGO_WEBHOOK_SECRET, 'WEBHOOK_SECRET_MISSING', 'La firma de webhooks no está configurada.', 32);
    const tokenSecret = requireSecret(env.ORDER_TOKEN_SECRET, 'ORDER_TOKEN_SECRET_MISSING', 'La protección de pedidos no está configurada.', 32); const mode = requireCommerceMode(env);
    const body = await readJsonBody(request, 32_768); if (!isRecord(body)) throw new HttpError(400, 'INVALID_CHECKOUT', 'La solicitud de checkout no es válida.');
    assertExactKeys(body, ['idempotencyKey', 'items', 'fulfillment'], 'INVALID_CHECKOUT', 'La solicitud contiene campos no permitidos.');
    if (env.MERCADO_LIBRE_CATALOG_ENABLED === 'true') {
      await revalidateMercadoLibreCart(
        database,
        env,
        body,
        await listCatalogProductDetails(database),
        'checkout',
      );
    }
    const idempotencyKey = assertUuid(body.idempotencyKey, 'idempotencyKey'); const existingOrder = await getOrderByIdempotencyKey(database, idempotencyKey); const cart = await recalculateDynamicCart(body, database, env, existingOrder?.channel === 'checkout_pro' ? existingOrder.id : null);
    await reserveCheckoutIntent(database, idempotencyKey, cart); const prepared = await prepareOrder({ cart, database, idempotencyKey, tokenSecret });
    await persistOrderFulfillment(database, prepared.order.id, cart); const paymentCart = createPaymentCart(cart); const { order } = prepared;
    if (order.status === 'approved' || order.status === 'refunded') throw new HttpError(409, 'ORDER_ALREADY_FINALIZED', 'Este pedido ya tiene un estado final.');
    assertMercadoPagoPreferenceActive(order.created_at);
    if (env.MERCADO_LIBRE_CATALOG_ENABLED === 'true') {
      try {
        await reserveMercadoLibreInventory(
          database,
          env,
          order.id,
          cart.lines.map(({ product, quantity }) => ({
            productId: product.id,
            quantity,
            expectedCatalogVersion: product.providerCatalogVersion ?? '',
          })),
        );
      } catch (error: unknown) {
        await failOrderBeforePreference(
          database,
          order.id,
          error instanceof HttpError ? error.code : 'MERCADO_LIBRE_RESERVATION_FAILED',
        );
        throw error;
      }
    }
    if (order.mp_preference_id !== null && order.mp_checkout_url !== null) return checkoutResponse(order.mp_checkout_url, prepared.publicToken, 200);
    if (order.mp_preference_attempted_at !== null) {
      const recovered = await recoverMercadoPagoPreference({ accessToken, cart: paymentCart, createdAt: order.created_at, mode, orderId: order.id });
      if (recovered === null) throw new HttpError(409, 'PREFERENCE_RECOVERY_PENDING', 'Existe un intento de pago previo que todavía no puede confirmarse.');
      await markPreferenceCreated(database, order.id, recovered.id, recovered.checkoutUrl); return checkoutResponse(recovered.checkoutUrl, prepared.publicToken, 200);
    }
    if (order.status === 'failed') await resetRetrySafeFailedOrder(database, order.id); const attemptToken = await claimPreferenceAttempt(database, order.id);
    if (attemptToken === null) throw new HttpError(409, 'PREFERENCE_ATTEMPT_IN_PROGRESS', 'Ya existe un intento de pago en curso para este pedido.');
    try {
      const preference = await createMercadoPagoPreference({ accessToken, cart: paymentCart, createdAt: order.created_at, mode, orderId: order.id, publicToken: prepared.publicToken, siteUrl });
      await markPreferenceCreated(database, order.id, preference.id, preference.checkoutUrl, attemptToken);
      return checkoutResponse(preference.checkoutUrl, prepared.publicToken, prepared.created ? 201 : 200);
    } catch (error: unknown) {
      const code = error instanceof HttpError ? error.code : 'PREFERENCE_PERSIST_FAILED'; const retrySafe = code === 'PAYMENT_PROVIDER_REJECTED';
      if (env.MERCADO_LIBRE_CATALOG_ENABLED === 'true' && retrySafe) {
        try { await releaseMercadoLibreInventory(database, env, order.id); }
        catch { /* El ledger deja la compensación pendiente para conciliación. */ }
      }
      try { await markOrderFailed(database, order.id, attemptToken, code, retrySafe); } catch (persistenceError: unknown) { console.error('Could not persist checkout failure', { name: persistenceError instanceof Error ? persistenceError.name : 'UnknownError' }); }
      throw error;
    }
  } catch (error: unknown) { return responseFromError(error); }
};
function checkoutResponse(checkoutUrl: string, publicToken: string, status: number): Response { return jsonResponse({ checkoutUrl, publicToken }, status); }
