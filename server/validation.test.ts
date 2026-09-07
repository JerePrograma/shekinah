import { assertSameOrigin, readJsonBody, requestHasBodyBytes } from './validation';

describe('detección de bytes en imports sin payload', () => {
  it('corta y cancela al primer byte sin acumular el resto del stream', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(0));
        controller.enqueue(new Uint8Array([0]));
        controller.enqueue(new Uint8Array(1_000_000));
      }, cancel,
    });
    await expect(requestHasBodyBytes({ body: stream } as Request)).resolves.toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it('rechaza una lectura fallida sin dejar el stream bloqueado', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('Stream failed')); } });
    await expect(requestHasBodyBytes({ body: stream } as Request)).rejects.toThrow('Stream failed');
    expect(stream.locked).toBe(false);
  });
});

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
