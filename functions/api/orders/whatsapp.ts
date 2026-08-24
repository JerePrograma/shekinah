import { createWhatsappOrder } from '../../../server/whatsapp-orders';
import { listCatalogProductDetails } from '../../../server/catalog-store';
import { revalidateMercadoLibreCart } from '../../../server/mercado-libre-catalog';
import {
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  responseFromError,
} from '../../../server/http';
import type { PagesFunction } from '../../../server/platform';
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
