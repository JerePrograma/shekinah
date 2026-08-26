import {
  createWhatsappOrder,
  recalculateWhatsappCart,
} from '../../../server/whatsapp-orders';
import { listCatalogProductDetails } from '../../../server/catalog-store';
import { revalidateMercadoLibreCart } from '../../../server/mercado-libre-catalog';
import { expireWhatsappReservations } from '../../../server/stock-reservations';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  responseFromError,
} from '../../../server/http';
import type { D1Database, PagesFunction } from '../../../server/platform';
import { assertSameOrigin, readJsonBody } from '../../../server/validation';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    assertSameOrigin(request, env);
    const database = requireDatabase(env);
    const body = await readJsonBody(request, 32_768);
    if (env.MERCADO_LIBRE_CATALOG_ENABLED === 'true') {
      await revalidateMercadoLibreCart(
        database,
        env,
        body,
        await listCatalogProductDetails(database),
        'whatsapp',
      );
    } else if (await hasLocalStockReservationSchema(database)) {
      await expireWhatsappReservations(database);
      const { cart } = await recalculateWhatsappCart(body, database, env);
      const unconfiguredLine = cart.lines.find(({ product }) => (
        product.providerCatalogVersion === undefined && product.stockControlled !== true
      ));
      if (unconfiguredLine !== undefined) {
        throw new HttpError(
          409,
          'STOCK_NOT_CONFIGURED',
          `${unconfiguredLine.product.name} todavía no tiene stock cargado.`,
        );
      }
    }
    const created = await createWhatsappOrder(
      database,
      body,
      env,
    );
    return jsonResponse(created.response, created.created ? 201 : 200);
  } catch (error: unknown) {
    return responseFromError(error);
  }
};

async function hasLocalStockReservationSchema(database: D1Database): Promise<boolean> {
  try {
    await database.prepare('SELECT stock_controlled FROM order_items LIMIT 0').first();
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (
      /no such column:\s*(?:\w+\.)?stock_controlled/iu.test(message) ||
      /no such table:\s*order_items/iu.test(message)
    ) {
      return false;
    }
    throw error;
  }
}
