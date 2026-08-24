import type { D1Database } from './platform';

export const WHATSAPP_RESERVATION_EXPIRED_CODE = 'WHATSAPP_RESERVATION_EXPIRED';

export async function expireWhatsappReservations(
  database: D1Database,
  now = new Date(),
): Promise<number> {
  const timestamp = now.toISOString();
  try {
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
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      /no such (?:table|column):\s*(?:orders|(?:\w+\.)?(?:channel|stock_consumed_at|stock_reservation_expires_at|resolved_at|resolved_by))/iu.test(error.message)
    ) {
      return 0;
    }
    throw error;
  }
}
