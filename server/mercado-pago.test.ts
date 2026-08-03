import { hmacSha256Hex } from './crypto';
import { mapPaymentStatus, verifyMercadoPagoWebhook } from './mercado-pago';

describe('Mercado Pago', () => {
  it('verifica el manifiesto firmado y rechaza un ID diferente', async () => {
    const secret = 's'.repeat(40);
    const dataId = '456789';
    const requestId = 'request-123';
    const timestamp = '1720000000';
    const digest = await hmacSha256Hex(
      secret,
      `id:${dataId};request-id:${requestId};ts:${timestamp};`,
    );
    await expect(verifyMercadoPagoWebhook({
      dataId,
      requestId,
      secret,
      signatureHeader: `ts=${timestamp},v1=${digest}`,
    })).resolves.toEqual({ timestamp, digest });
    await expect(verifyMercadoPagoWebhook({
      dataId: '456780',
      requestId,
      secret,
      signatureHeader: `ts=${timestamp},v1=${digest}`,
    })).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
  });

  it('mapea estados finales sin degradarlos en la capa de pedidos', () => {
    expect(mapPaymentStatus('approved')).toBe('approved');
    expect(mapPaymentStatus('charged_back')).toBe('refunded');
    expect(mapPaymentStatus('in_process')).toBe('pending');
  });
});
