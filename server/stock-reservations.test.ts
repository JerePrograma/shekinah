import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createTestD1 } from '../src/test/d1';
import { expireWhatsappReservations } from './stock-reservations';

const migrations = Array.from({ length: 12 }, (_, index) => {
  const prefix = String(index + 1).padStart(4, '0');
  const names = [
    'commerce',
    'fulfillment_and_retention',
    'checkout_intent_cart_fingerprint',
    'catalog_admin',
    'admin_auth',
    'analytics_manual_payment_click',
    'whatsapp_order_reservations',
    'checkout_pro_stock_and_whatsapp_identity',
    'mercadolibre_catalog_and_inventory',
    'checkout_terminal_reservation_release',
    'local_order_stock_required',
    'dux_authoritative_inventory',
  ] as const;
  const name = names[index];
  if (name === undefined) throw new Error('Migración de prueba ausente.');
  return readFileSync(resolve(process.cwd(), 'migrations', `${prefix}_${name}.sql`), 'utf8');
});

describe('vencimiento de reservas con proveedor externo', () => {
  it('no rechaza ni libera localmente un pedido vinculado a Dux', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      await insertPendingWhatsappOrder(testD1.database, 'ord_dux_expiry_blocked');
      const now = '2026-08-26T12:00:00.000Z';
      await testD1.database.prepare(`INSERT INTO dux_order_links (
        order_id, dux_reference, company_id, branch_id, deposit_id,
        reservation_state, request_fingerprint, created_at, updated_at
      ) VALUES (?, ?, '1', '2', '3', 'confirmed', ?, ?, ?)`)
        .bind(
          'ord_dux_expiry_blocked',
          'shekinah:ord_dux_expiry_blocked',
          'f'.repeat(64),
          now,
          now,
        )
        .run();

      await expect(expireWhatsappReservations(
        testD1.database,
        new Date('2026-08-27T12:00:00.000Z'),
      )).resolves.toBe(0);
      await expect(testD1.database.prepare(
        'SELECT status, last_error_code FROM orders WHERE id = ?',
      ).bind('ord_dux_expiry_blocked').first()).resolves.toEqual({
        status: 'pending',
        last_error_code: null,
      });
    } finally {
      testD1.close();
    }
  });

  it('mantiene el vencimiento histórico para una reserva exclusivamente local', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      await insertPendingWhatsappOrder(testD1.database, 'ord_legacy_expiry');
      await expect(expireWhatsappReservations(
        testD1.database,
        new Date('2026-08-27T12:00:00.000Z'),
      )).resolves.toBe(1);
      await expect(testD1.database.prepare(
        'SELECT status, last_error_code FROM orders WHERE id = ?',
      ).bind('ord_legacy_expiry').first()).resolves.toEqual({
        status: 'rejected',
        last_error_code: 'WHATSAPP_RESERVATION_EXPIRED',
      });
    } finally {
      testD1.close();
    }
  });
});

async function insertPendingWhatsappOrder(
  database: Parameters<typeof expireWhatsappReservations>[0],
  id: string,
): Promise<void> {
  const createdAt = '2026-08-25T10:00:00.000Z';
  await database.prepare(`INSERT INTO orders (
    id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
    status, currency, total_minor, item_count, created_at, updated_at,
    channel, stock_reservation_expires_at
  ) VALUES (?, ?, ?, ?, 'pending', 'ARS', 1000, 1, ?, ?, 'whatsapp', ?)`)
    .bind(
      id,
      `${id}-token`,
      crypto.randomUUID(),
      `${id}-fingerprint`,
      createdAt,
      createdAt,
      '2026-08-25T11:00:00.000Z',
    )
    .run();
}
