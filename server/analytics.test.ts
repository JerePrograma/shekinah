import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deleteAnalyticsSession,
  parseAnalyticsEvent,
  storeAnalyticsEvent,
} from './analytics';
import { hmacSha256Hex } from './crypto';
import { SqliteD1 } from './test/sqlite-d1';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations', '0001_commerce.sql'),
  'utf8',
);

describe('analítica first-party', () => {
  it('acepta sólo eventos permitidos y rutas sin query o fragmento', () => {
    const base = {
      eventId: crypto.randomUUID(),
      eventName: 'page_view',
      sessionId: crypto.randomUUID(),
      consentVersion: '1',
      path: '/catalogo',
      source: 'direct',
      deviceClass: 'desktop',
    };
    expect(parseAnalyticsEvent(base)).toMatchObject(base);
    expect(() => parseAnalyticsEvent({ ...base, eventName: 'email_capture' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_ANALYTICS_EVENT' }),
    );
    expect(() => parseAnalyticsEvent({ ...base, path: '/catalogo?utm_source=x' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_ANALYTICS_EVENT' }),
    );
  });

  it('elimina la sesión y una solicitud posterior no puede recrearla', async () => {
    const database = new SqliteD1(migration);
    const secret = 'a'.repeat(40);
    const sessionId = crypto.randomUUID();
    const makeEvent = (eventName: 'page_view' | 'cart_add') => parseAnalyticsEvent({
      eventId: crypto.randomUUID(),
      eventName,
      sessionId,
      consentVersion: '1',
      path: eventName === 'page_view' ? '/catalogo' : '/carrito',
      ...(eventName === 'cart_add' ? { productId: 'producto-prueba' } : {}),
      source: 'direct',
      deviceClass: 'desktop',
    });
    try {
      await expect(storeAnalyticsEvent(database, secret, makeEvent('page_view'))).resolves.toBe('stored');
      await deleteAnalyticsSession(database, secret, sessionId);
      await expect(storeAnalyticsEvent(database, secret, makeEvent('cart_add'))).resolves.toBe('revoked');
      const sessionHash = await hmacSha256Hex(secret, `analytics-session:${sessionId}`);
      expect(await database.prepare(
        'SELECT COUNT(*) AS count FROM analytics_sessions WHERE session_hash = ?',
      ).bind(sessionHash).first<number>('count')).toBe(0);
      expect(await database.prepare(
        'SELECT COUNT(*) AS count FROM analytics_events WHERE session_hash = ?',
      ).bind(sessionHash).first<number>('count')).toBe(0);
      expect(await database.prepare(
        'SELECT COUNT(*) AS count FROM analytics_revocations WHERE session_hash = ?',
      ).bind(sessionHash).first<number>('count')).toBe(1);
    } finally {
      database.close();
    }
  });
});
