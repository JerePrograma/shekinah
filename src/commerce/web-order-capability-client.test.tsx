import { act, renderHook, waitFor } from '@testing-library/react';
import { useWebOrderRegistrationEnabled } from './web-order-capability-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('habilita sólo ante una respuesta binaria positiva del servidor', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ enabled: true }));
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useWebOrderRegistrationEnabled());
  expect(result.current).toBe(false);
  await waitFor(() => expect(result.current).toBe(true));
  expect(fetchMock).toHaveBeenCalledWith('/api/orders/request-capability', expect.objectContaining({
    credentials: 'same-origin',
    redirect: 'error',
  }));
});

it.each([
  new Response(null, { status: 503 }),
  Response.json({ enabled: false }),
  Response.json({ enabled: true, reason: 'secreto' }),
])('falla cerrado con HTTP o contrato no válido', async (response) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response));
  const { result } = renderHook(() => useWebOrderRegistrationEnabled());
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(result.current).toBe(false);
});

it('falla cerrado ante error de red', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('network')));
  const { result } = renderHook(() => useWebOrderRegistrationEnabled());
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(result.current).toBe(false);
});
