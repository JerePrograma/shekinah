import { readWebRequest, startWebRequestCheckout } from './web-request-api';

afterEach(() => { vi.unstubAllGlobals(); });

it('inicia el checkout asistido sin body y valida total y dominio Mercado Pago', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic',
    totalMinor: 123_400,
  }, { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  const result = await startWebRequestCheckout('a'.repeat(64), 123_400);
  expect(result).toEqual({
    checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic',
    totalMinor: 123_400,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [, init] = fetchMock.mock.calls[0] ?? [];
  expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', redirect: 'error' });
  expect(init).not.toHaveProperty('body');
  expect(init).not.toHaveProperty('headers');
});

it('rechaza total distinto, host ajeno y estado de solicitud inválido', async () => {
  const token = 'b'.repeat(64);
  vi.stubGlobal('fetch', vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ checkoutUrl: 'https://www.mercadopago.com.ar/checkout', totalMinor: 1 }))
    .mockResolvedValueOnce(Response.json({ checkoutUrl: 'https://example.test/checkout', totalMinor: 123_400 }))
    .mockResolvedValueOnce(Response.json({
      reference: 'WEB-abcdefghijklmnopqrstuvwx', status: 'accepted', createdAt: '2026-09-10T12:00:00.000Z',
      updatedAt: '2026-09-10T12:00:00.000Z', paymentStatus: 'pending', paymentRequiresReview: false,
      reservationStatus: 'confirmed', checkoutAvailable: true, totalMinor: 123_400,
    })));
  await expect(startWebRequestCheckout(token, 123_400)).rejects.toThrow('respuesta de pago inválida');
  await expect(startWebRequestCheckout(token, 123_400)).rejects.toThrow('URL de pago no autorizada');
  await expect(readWebRequest(token)).rejects.toThrow('solicitud web inválida');
});

it('propaga un mensaje de error del servidor sin convertirlo en una compra exitosa', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    error: { code: 'ASSISTED_RESERVATION_REQUIRED', message: 'La reserva Dux debe estar confirmada antes de iniciar el pago.' },
  }, { status: 409 })));
  await expect(startWebRequestCheckout('c'.repeat(64), 10_000))
    .rejects.toThrow('La reserva Dux debe estar confirmada antes de iniciar el pago.');
});
