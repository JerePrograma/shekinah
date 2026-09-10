import { SqliteD1 } from '../../../server/test/sqlite-d1';
import type { Env, PagesFunctionContext } from '../../../server/platform';
import { onRequest } from './request-capability';

const doubles = vi.hoisted(() => ({ enabled: vi.fn() }));
vi.mock('../../../server/web-order-capability', () => ({ webOrderRegistrationEnabled: doubles.enabled }));

function context(database: SqliteD1 | undefined, method = 'GET'): PagesFunctionContext<Env> {
  return {
    request: new Request('https://shekinah.ar/api/orders/request-capability', { method }),
    env: database === undefined ? {} : { DB: database },
    params: {},
    data: {},
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

afterEach(() => {
  doubles.enabled.mockReset();
});

it('expone sólo un booleano y no los bloqueos internos', async () => {
  const database = new SqliteD1('');
  try {
    doubles.enabled.mockResolvedValue(true);
    const response = await onRequest(context(database));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ enabled: true });
    expect(doubles.enabled).toHaveBeenCalledWith(database, { DB: database });
  } finally {
    database.close();
  }
});

it('falla cerrado si falta D1 o el diagnóstico interno falla', async () => {
  expect(await (await onRequest(context(undefined))).json()).toEqual({ enabled: false });
  const database = new SqliteD1('');
  try {
    doubles.enabled.mockRejectedValue(new Error('secret-name-should-not-leak'));
    const response = await onRequest(context(database));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false });
    expect(await response.text()).not.toContain('secret-name-should-not-leak');
  } finally {
    database.close();
  }
});

it('rechaza métodos mutantes sin consultar capacidad', async () => {
  const database = new SqliteD1('');
  try {
    const response = await onRequest(context(database, 'POST'));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(doubles.enabled).not.toHaveBeenCalled();
  } finally {
    database.close();
  }
});
