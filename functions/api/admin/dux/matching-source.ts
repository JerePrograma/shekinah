import { handleAdminRequest } from '../../../../server/admin-request';
import { listCatalogProductDetails } from '../../../../server/catalog-store';
import { readMercadoLibreCatalogMaxAgeSeconds } from '../../../../server/config';
import { DUX_PUBLIC_PRICE_LIST_NAME } from '../../../../server/dux-catalog';
import { listDuxInventoryUnits } from '../../../../server/dux-inventory';
import { createDuxInventoryReader } from '../../../../server/dux-inventory-reader';
import { readMercadoLibreMatchingSource } from '../../../../server/dux-matching-source';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
} from '../../../../server/http';
import type {
  AdminContextData,
  Env,
  PagesFunction,
} from '../../../../server/platform';
import { assertSameOrigin } from '../../../../server/validation';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({
  data,
  env,
  request,
}) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);

  return handleAdminRequest(
    request,
    env,
    data,
    'admin.dux.matching-source',
    async (database) => {
      assertSameOrigin(request, env);

      const running = await database
        .prepare(
          `SELECT COUNT(*) AS total
           FROM dux_sync_runs
           WHERE status = 'running'`,
        )
        .first<Readonly<{ total: unknown }>>();
      if (
        running === null ||
        typeof running.total !== 'number' ||
        !Number.isSafeInteger(running.total) ||
        running.total < 0
      ) {
        throw new HttpError(
          503,
          'DUX_SYNC_STATE_INVALID',
          'No se pudo verificar el estado actual de sincronización Dux.',
        );
      }
      if (running.total !== 0) {
        throw new HttpError(
          409,
          'DUX_SYNC_IN_PROGRESS',
          'Hay una sincronización Dux en curso. Reintentá el análisis fuera de esa ventana.',
        );
      }

      const reader = createDuxInventoryReader(env);
      const [localProducts, inventoryUnits, mercadoLibre] = await Promise.all([
        listCatalogProductDetails(database),
        listDuxInventoryUnits(database, env),
        readMercadoLibreMatchingSource(
          database,
          readMercadoLibreCatalogMaxAgeSeconds(env),
        ),
      ]);

      await reader.listItems({ enabled: true });
      const duxItems = reader.takeCatalogItems();

      return jsonResponse({
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        readOnly: true,
        priceListName: DUX_PUBLIC_PRICE_LIST_NAME,
        authority: Object.freeze({
          dux: Object.freeze(['existence', 'name', 'price', 'stock']),
          local: Object.freeze([
            'images',
            'description',
            'shortDescription',
            'presentation',
          ]),
          mercadoLibre: 'editorial_evidence_only',
        }),
        duxItems,
        localProducts,
        inventoryUnits,
        mercadoLibre,
      });
    },
  );
};
