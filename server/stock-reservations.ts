import type { D1Database } from './platform';

export const WHATSAPP_RESERVATION_EXPIRED_CODE = 'WHATSAPP_RESERVATION_EXPIRED';

export async function expireWhatsappReservations(
  database: D1Database,
  now = new Date(),
): Promise<number> {
  const timestamp = now.toISOString();
  let includeMercadoLibreGuard = true;
  let includeDuxGuard = true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await expireWhatsappReservationsWithGuards(
        database,
        timestamp,
        includeMercadoLibreGuard,
        includeDuxGuard,
      );
    } catch (error: unknown) {
      if (isMissingTable(error, 'mercadolibre_inventory_operations')) {
        includeMercadoLibreGuard = false;
        continue;
      }
      if (isMissingTable(error, 'dux_order_links')) {
        includeDuxGuard = false;
        continue;
      }
      if (isMissingReservationSchema(error)) return 0;
      throw error;
    }
  }
  return 0;
}

async function expireWhatsappReservationsWithGuards(
  database: D1Database,
  timestamp: string,
  includeMercadoLibreGuard: boolean,
  includeDuxGuard: boolean,
): Promise<number> {
  const mercadoLibreGuard = includeMercadoLibreGuard
    ? `AND NOT EXISTS (
         SELECT 1 FROM mercadolibre_inventory_operations AS ml_operations
         WHERE ml_operations.order_id = orders.id
           AND ml_operations.action = 'reserve'
           AND ml_operations.status IN (
             'pending', 'applied', 'confirmed', 'compensation_pending', 'uncertain'
           )
       )`
    : '';
  const duxGuard = includeDuxGuard
    ? `AND NOT EXISTS (
         SELECT 1 FROM dux_order_links AS dux_links
         WHERE dux_links.order_id = orders.id
       )`
    : '';
  const result = await database
    .prepare(
      `UPDATE orders
       SET status = 'rejected',
           last_error_code = ?,
           resolved_at = ?,
           resolved_by = 'system:reservation-expiry',
           updated_at = ?
       WHERE channel = 'whatsapp'
         AND status = 'pending'
         AND stock_consumed_at IS NULL
         AND stock_reservation_expires_at IS NOT NULL
         ${mercadoLibreGuard}
         ${duxGuard}
         AND unixepoch(stock_reservation_expires_at) <= unixepoch(?)`,
    )
    .bind(
      WHATSAPP_RESERVATION_EXPIRED_CODE,
      timestamp,
      timestamp,
      timestamp,
    )
    .run();
  return result.meta.changes ?? 0;
}

function isMissingTable(error: unknown, table: string): boolean {
  return error instanceof Error &&
    new RegExp(`no such table:\\s*${table}`, 'iu').test(error.message);
}

function isMissingReservationSchema(error: unknown): boolean {
  return error instanceof Error &&
    /no such (?:table|column):\s*(?:orders|(?:\w+\.)?(?:channel|stock_consumed_at|stock_reservation_expires_at|resolved_at|resolved_by))/iu.test(error.message);
}
