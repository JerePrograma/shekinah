import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  Env,
  PagesFunctionContext,
} from '../../../../server/platform';
import { onRequest } from './reconcile';

const schedulerSecret = 'scheduler-secret-with-at-least-thirty-two-characters';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reconciliación programada de Mercado Libre', () => {
  it('admite solamente POST', async () => {
    const probe = retiredEndpointProbe();
    const response = await onRequest(context(
      new Request('https://example.test/api/internal/mercadolibre/reconcile'),
      probe,
    ));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expectRetiredWithoutSideEffects(probe);
  });

  it.each([
    ['una credencial incorrecta', 'incorrecta'],
    ['la antigua credencial válida', schedulerSecret],
  ])('responde 410 con %s sin consultar ni mutar Mercado Libre', async (_scenario, secret) => {
    const probe = retiredEndpointProbe();
    const response = await onRequest(context(request(secret), probe));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'MERCADO_LIBRE_DIRECT_INTEGRATION_RETIRED' },
    });
    expectRetiredWithoutSideEffects(probe);
  });
});

function request(secret: string): Request {
  return new Request('https://example.test/api/internal/mercadolibre/reconcile', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });
}

type RetiredEndpointProbe = Readonly<{
  database: ForbiddenDatabase;
  fetch: ReturnType<typeof vi.fn>;
  waitUntil: (promise: Promise<unknown>) => void;
}>;

function retiredEndpointProbe(): RetiredEndpointProbe {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  return Object.freeze({
    database: new ForbiddenDatabase(),
    fetch: fetchMock,
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
  });
}

function context(requestValue: Request, probe: RetiredEndpointProbe): PagesFunctionContext {
  const env: Env = Object.freeze({
    DB: probe.database,
    MERCADO_LIBRE_CATALOG_ENABLED: 'true',
    MERCADO_LIBRE_SCHEDULER_SECRET: schedulerSecret,
  });
  return {
    request: requestValue,
    env,
    params: {},
    data: {},
    next: () => Promise.resolve(new Response()),
    waitUntil: probe.waitUntil,
  };
}

function expectRetiredWithoutSideEffects(probe: RetiredEndpointProbe): void {
  expect(probe.fetch).not.toHaveBeenCalled();
  expect(probe.database.calls).toBe(0);
  expect(probe.waitUntil).not.toHaveBeenCalled();
}

class ForbiddenDatabase implements D1Database {
  calls = 0;

  prepare(): D1PreparedStatement {
    this.calls += 1;
    throw new Error('El endpoint retirado no debe preparar consultas.');
  }

  batch<T = Record<string, unknown>>(): Promise<readonly D1Result<T>[]> {
    this.calls += 1;
    throw new Error('El endpoint retirado no debe ejecutar lotes.');
  }

  exec(): Promise<Readonly<{ count: number; duration: number }>> {
    this.calls += 1;
    throw new Error('El endpoint retirado no debe ejecutar SQL.');
  }
}
