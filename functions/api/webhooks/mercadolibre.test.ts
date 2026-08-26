import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  Env,
  PagesFunctionContext,
} from '../../../server/platform';
import { onRequest } from './mercadolibre';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('webhook retirado de Mercado Libre', () => {
  it('admite solamente POST sin tocar proveedores ni persistencia', async () => {
    const probe = retiredEndpointProbe();
    const response = await onRequest(context(
      probe,
      new Request('https://preview.example.test/api/webhooks/mercadolibre'),
    ));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expectRetiredWithoutSideEffects(probe);
  });

  it.each([
    ['una notificación histórica válida', JSON.stringify({
      application_id: 123456789,
      user_id: 987654321,
      topic: 'stock-location',
      resource: '/user-products/MLAU12345/stock',
      sent: '2026-08-25T10:00:00.000Z',
    })],
    ['un cuerpo inválido', 'esto no es JSON'],
  ])('responde 200 no-op para %s sin leer D1 ni llamar Mercado Libre', async (_scenario, body) => {
    const probe = retiredEndpointProbe();
    const response = await onRequest(context(probe, request(body)));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('');
    expectRetiredWithoutSideEffects(probe);
  });
});

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

function context(probe: RetiredEndpointProbe, requestValue: Request): PagesFunctionContext<Env> {
  return {
    request: requestValue,
    env: {
      DB: probe.database,
      MERCADO_LIBRE_CATALOG_ENABLED: 'true',
      MERCADO_LIBRE_APPLICATION_ID: '123456789',
    },
    params: {},
    data: {},
    functionPath: '/api/webhooks/mercadolibre',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: probe.waitUntil,
  };
}

function request(body: string): Request {
  return new Request('https://preview.example.test/api/webhooks/mercadolibre', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
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
    throw new Error('El webhook retirado no debe preparar consultas.');
  }

  batch<T = Record<string, unknown>>(): Promise<readonly D1Result<T>[]> {
    this.calls += 1;
    throw new Error('El webhook retirado no debe ejecutar lotes.');
  }

  exec(): Promise<Readonly<{ count: number; duration: number }>> {
    this.calls += 1;
    throw new Error('El webhook retirado no debe ejecutar SQL.');
  }
}
