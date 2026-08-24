import { describe, expect, it } from 'vitest';

import type { Env, PagesFunctionContext } from '../../../../server/platform';
import { onRequest } from './reconcile';

const schedulerSecret = 'scheduler-secret-with-at-least-thirty-two-characters';

describe('reconciliación programada de Mercado Libre', () => {
  it('admite solamente POST', async () => {
    const response = await onRequest(context(new Request('https://example.test/api/internal/mercadolibre/reconcile')));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('rechaza una credencial incorrecta sin iniciar la sincronización', async () => {
    const response = await onRequest(context(request('incorrecta')));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'SCHEDULER_UNAUTHORIZED' } });
  });

  it('responde de forma idempotente cuando el catálogo todavía está cerrado', async () => {
    const response = await onRequest(context(request(schedulerSecret)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'disabled' });
  });
});

function request(secret: string): Request {
  return new Request('https://example.test/api/internal/mercadolibre/reconcile', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });
}

function context(requestValue: Request): PagesFunctionContext {
  const env: Env = Object.freeze({
    MERCADO_LIBRE_CATALOG_ENABLED: 'false',
    MERCADO_LIBRE_SCHEDULER_SECRET: schedulerSecret,
  });
  return {
    request: requestValue,
    env,
    params: {},
    data: {},
    next: () => Promise.resolve(new Response()),
    waitUntil: () => undefined,
  };
}
