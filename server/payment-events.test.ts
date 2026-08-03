import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { finishPaymentEvent, registerPaymentEvent } from './payment-events';
import { SqliteD1 } from './test/sqlite-d1';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations', '0001_commerce.sql'),
  'utf8',
);

function register(database: SqliteD1, eventKey = 'event-key') {
  return registerPaymentEvent({
    action: 'payment.updated',
    database,
    eventKey,
    eventType: 'payment',
    requestId: 'request-1',
    resourceId: '12345',
    signatureTimestamp: '1720000000',
  });
}

describe('reclamo idempotente de webhooks', () => {
  it('reclama una sola vez, permite reintentar fallos y recupera leases vencidos', async () => {
    const database = new SqliteD1(migration);
    try {
      const first = await register(database);
      const duplicate = await register(database);
      expect(first.claimed).toBe(true);
      expect(first.owner).not.toBeNull();
      expect(duplicate).toEqual({ claimed: false, owner: null });
      if (first.owner === null) throw new Error('Falta propietario del reclamo.');
      await finishPaymentEvent(database, 'event-key', first.owner, {
        status: 'failed',
        responseCode: 502,
        errorCode: 'PAYMENT_LOOKUP_FAILED',
      });
      expect((await register(database)).claimed).toBe(true);

      const stale = await register(database, 'stale-event');
      expect(stale.claimed).toBe(true);
      await database.prepare(
        `UPDATE payment_events
         SET processing_started_at = '2000-01-01T00:00:00.000Z'
         WHERE provider_event_key = 'stale-event'`,
      ).run();
      const reclaimed = await register(database, 'stale-event');
      expect(reclaimed.claimed).toBe(true);
      expect(reclaimed.owner).not.toBe(stale.owner);
    } finally {
      database.close();
    }
  });
});
