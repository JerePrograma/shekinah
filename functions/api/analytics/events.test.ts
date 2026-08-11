import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { deleteAnalyticsSession } from '../../../server/analytics';
import type { Env, PagesFunctionContext } from '../../../server/platform';
import { createTestD1 } from '../../../src/test/d1';
import { onRequest } from './events';

const migrations = [
  '0001_commerce.sql',
  '0002_fulfillment_and_retention.sql',
  '0006_analytics_manual_payment_click.sql',
].map((file) => readFileSync(resolve(process.cwd(), 'migrations', file), 'utf8'));

describe('endpoint de eventos analíticos', () => {
  it('acepta sólo POST y falla cerrado sin flag, retención o secreto', async () => {
    const getResponse = await onRequest(context(new Request('https://example.test/api/analytics/events')));
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get('allow')).toBe('POST');

    const disabledResponse = await onRequest(context(analyticsRequest(validEvent())));
    expect(disabledResponse.status).toBe(503);
    await expect(disabledResponse.json()).resolves.toMatchObject({
      error: { code: 'ANALYTICS_DISABLED' },
    });

    const retentionResponse = await onRequest(context(analyticsRequest(validEvent()), {
      ANALYTICS_ENABLED: 'true',
      PUBLIC_SITE_URL: 'https://example.test',
    }));
    expect(retentionResponse.status).toBe(503);
    await expect(retentionResponse.json()).resolves.toMatchObject({
      error: { code: 'ANALYTICS_RETENTION_MISSING' },
    });

    const testD1 = createTestD1(...migrations);
    try {
      const secretResponse = await onRequest(context(analyticsRequest(validEvent()), {
        ANALYTICS_ENABLED: 'true',
        ANALYTICS_RETENTION_DAYS: '730',
        PUBLIC_SITE_URL: 'https://example.test',
        DB: testD1.database,
      }));
      expect(secretResponse.status).toBe(503);
      await expect(secretResponse.json()).resolves.toMatchObject({
        error: { code: 'ANALYTICS_SECRET_MISSING' },
      });
    } finally {
      testD1.close();
    }
  });

  it('acepta manual_payment_click, persiste sólo el hash y rechaza eventos inválidos', async () => {
    const testD1 = createTestD1(...migrations);
    const waits: Promise<unknown>[] = [];
    const sessionId = crypto.randomUUID();
    try {
      const env = enabledEnv(testD1.database);
      const response = await onRequest(context(
        analyticsRequest(validEvent({ sessionId })),
        env,
        waits,
      ));
      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({ accepted: true });
      await Promise.all(waits);

      expect(testD1.sqlite.prepare(
        'SELECT event_name, path, product_id FROM analytics_events',
      ).get()).toEqual({
        event_name: 'manual_payment_click',
        path: '/carrito',
        product_id: null,
      });
      const session = testD1.sqlite.prepare(
        'SELECT session_hash FROM analytics_sessions',
      ).get() as Readonly<{ session_hash: string }>;
      expect(session.session_hash).not.toBe(sessionId);
      expect(session.session_hash).toMatch(/^[0-9a-f]{64}$/u);

      const unknownResponse = await onRequest(context(
        analyticsRequest({ ...validEvent(), eventName: 'payment_approved' }),
        env,
      ));
      expect(unknownResponse.status).toBe(400);
      await expect(unknownResponse.json()).resolves.toMatchObject({
        error: { code: 'INVALID_ANALYTICS_EVENT' },
      });

      const extraFieldResponse = await onRequest(context(
        analyticsRequest({ ...validEvent(), amount: 25_000 }),
        env,
      ));
      expect(extraFieldResponse.status).toBe(400);
    } finally {
      await Promise.allSettled(waits);
      testD1.close();
    }
  });

  it('mantiene revocada una sesión ante eventos posteriores', async () => {
    const testD1 = createTestD1(...migrations);
    const sessionId = crypto.randomUUID();
    const secret = 's'.repeat(40);
    try {
      await deleteAnalyticsSession(testD1.database, secret, sessionId);
      const response = await onRequest(context(
        analyticsRequest(validEvent({ sessionId })),
        { ...enabledEnv(testD1.database), ANALYTICS_HMAC_SECRET: secret },
      ));
      expect(response.status).toBe(410);
      await expect(response.json()).resolves.toEqual({ accepted: false });
      expect(testD1.sqlite.prepare('SELECT COUNT(*) AS count FROM analytics_events').get())
        .toEqual({ count: 0 });
    } finally {
      testD1.close();
    }
  });
});

function context(
  request: Request,
  env: Env = {},
  waits: Promise<unknown>[] = [],
): PagesFunctionContext {
  return {
    request,
    env,
    params: {},
    data: {},
    functionPath: '/api/analytics/events',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: (promise) => waits.push(promise),
  };
}

function analyticsRequest(body: unknown): Request {
  return new Request('https://example.test/api/analytics/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://example.test',
    },
    body: JSON.stringify(body),
  });
}

function validEvent(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    eventId: crypto.randomUUID(),
    eventName: 'manual_payment_click',
    sessionId: crypto.randomUUID(),
    consentVersion: '1',
    path: '/carrito',
    source: 'direct',
    deviceClass: 'desktop',
    ...overrides,
  };
}

function enabledEnv(database: NonNullable<Env['DB']>): Env {
  return {
    ANALYTICS_ENABLED: 'true',
    ANALYTICS_RETENTION_DAYS: '730',
    ANALYTICS_HMAC_SECRET: 's'.repeat(40),
    PUBLIC_SITE_URL: 'https://example.test',
    DB: database,
  };
}
