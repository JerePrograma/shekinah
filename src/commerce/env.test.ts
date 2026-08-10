import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getAuthorizedMercadoPagoPaymentLink,
  getAuthorizedWhatsappNumber,
} from './env';

describe('public commerce configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the explicitly authorized public defaults', () => {
    expect(getAuthorizedWhatsappNumber()).toBe('5492236216559');
    expect(getAuthorizedMercadoPagoPaymentLink()).toBe(
      'https://link.mercadopago.com.ar/shekinahmoreno',
    );
  });

  it('can be disabled explicitly without falling back again', () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '');
    vi.stubEnv('VITE_MERCADO_PAGO_PAYMENT_LINK', '');

    expect(getAuthorizedWhatsappNumber()).toBeNull();
    expect(getAuthorizedMercadoPagoPaymentLink()).toBeNull();
  });

  it('rejects an invalid WhatsApp value and a non-authorized payment host', () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', 'not-a-number');
    vi.stubEnv('VITE_MERCADO_PAGO_PAYMENT_LINK', 'https://example.com/payment');

    expect(getAuthorizedWhatsappNumber()).toBeNull();
    expect(getAuthorizedMercadoPagoPaymentLink()).toBeNull();
  });
});
