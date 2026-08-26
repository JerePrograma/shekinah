import {
  MERCADO_PAGO_APPLICATION_ID,
  requireMercadoPagoAccessToken,
} from './config';

describe('configuración de Mercado Pago', () => {
  it('acepta en producción únicamente el Access Token de la aplicación autorizada', () => {
    const accessToken = productionAccessToken(MERCADO_PAGO_APPLICATION_ID);

    expect(requireMercadoPagoAccessToken({
      MERCADO_PAGO_ACCESS_TOKEN: accessToken,
    }, 'production')).toBe(accessToken);
  });

  it.each([
    productionAccessToken('1111111111111111'),
    `${'TEST'}-${MERCADO_PAGO_APPLICATION_ID}-${'0'.repeat(40)}`,
    'credencial-productiva-sin-identidad',
  ])('falla cerrado ante una credencial productiva de otra aplicación o formato', (accessToken) => {
    expect(captureError(() => requireMercadoPagoAccessToken({
      MERCADO_PAGO_ACCESS_TOKEN: accessToken,
    }, 'production'))).toMatchObject({
      status: 503,
      code: 'PAYMENT_APPLICATION_MISMATCH',
    });
  });

  it('conserva el contrato sandbox sin exigir una credencial productiva', () => {
    const accessToken = 'sandbox-token-for-tests-only';

    expect(requireMercadoPagoAccessToken({
      MERCADO_PAGO_ACCESS_TOKEN: accessToken,
    }, 'sandbox')).toBe(accessToken);
  });
});

function productionAccessToken(applicationId: string): string {
  return `${['APP', 'USR'].join('_')}-${applicationId}-000000-${'0'.repeat(40)}`;
}

function captureError(callback: () => unknown): unknown {
  try {
    callback();
    return null;
  } catch (error: unknown) {
    return error;
  }
}
