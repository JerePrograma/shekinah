import { assertSameOrigin, readJsonBody } from './validation';

describe('lectura acotada de JSON', () => {
  it('acepta JSON dentro del límite sin Content-Length', async () => {
    const request = jsonRequest(JSON.stringify({ value: 'válido' }));

    await expect(readJsonBody(request, 64)).resolves.toEqual({ value: 'válido' });
  });

  it('corta el stream cuando supera el máximo sin Content-Length', async () => {
    const request = jsonRequest(JSON.stringify({ value: 'x'.repeat(128) }));

    await expect(readJsonBody(request, 32)).rejects.toMatchObject({
      status: 413,
      code: 'BODY_TOO_LARGE',
    });
  });

  it('rechaza Content-Length inválido antes de consumir el body', async () => {
    const request = new Request('https://example.test/api', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '1.5',
      },
      body: '{}',
    });

    await expect(readJsonBody(request, 32)).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_CONTENT_LENGTH',
    });
  });

  it('admite el host efectivo de un preview y rechaza un origen cruzado', () => {
    const env = { PUBLIC_SITE_URL: 'https://shekinah-7dl.pages.dev' };
    expect(() => assertSameOrigin(new Request(
      'https://preview.shekinah-7dl.pages.dev/api/admin/auth/login',
      { method: 'POST', headers: { origin: 'https://preview.shekinah-7dl.pages.dev' } },
    ), env)).not.toThrow();
    expect(() => assertSameOrigin(new Request(
      'https://preview.shekinah-7dl.pages.dev/api/admin/auth/login',
      { method: 'POST', headers: { origin: 'https://attacker.test' } },
    ), env)).toThrowError(expect.objectContaining({
      status: 403,
      code: 'ORIGIN_REJECTED',
    }));
  });
});

function jsonRequest(body: string): Request {
  return new Request('https://example.test/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}
