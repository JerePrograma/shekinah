import { parseOrderPaymentState, paymentStatePresentation } from './payment-state';

describe('contrato financiero público', () => {
  it('avisa pago recibido con incidencia sin pedir un segundo cobro', () => {
    const result = paymentStatePresentation({ status: 'approved', requiresReview: true, updatedAt: null });
    expect(result.title).toBe('Pago recibido. Pedido en revisión');
    expect(result.message).toContain('No vuelvas a pagar');
  });
  it('no presenta la aceptación comercial como pago ni un reintegro como devolución física', () => {
    expect(paymentStatePresentation({ status: 'none', requiresReview: false, updatedAt: null }).message)
      .toContain('no significa que esté pagado');
    expect(paymentStatePresentation({ status: 'refunded', requiresReview: true, updatedAt: null }).message)
      .toContain('no confirma una devolución de mercadería');
  });
  it.each([null, [], {}, { status: 'approved', requiresReview: 'false', updatedAt: null },
    { status: 'approved', requiresReview: false, updatedAt: 'invalid' },
    { status: 'inventado', requiresReview: false, updatedAt: null }])('rechaza datos financieros inválidos', (value) => {
    expect(() => parseOrderPaymentState(value)).toThrow();
  });
  it('reconstruye sólo campos públicos permitidos', () => {
    expect(parseOrderPaymentState({ status: 'approved', requiresReview: false, updatedAt: null, token: 'secret' }))
      .toEqual({ status: 'approved', requiresReview: false, updatedAt: null });
  });
});
