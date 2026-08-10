const AUTHORIZED_WHATSAPP_NUMBER = '5492236216559';
const AUTHORIZED_MERCADO_PAGO_PAYMENT_LINK = 'https://link.mercadopago.com.ar/shekinahmoreno';

export function getAuthorizedWhatsappNumber(): string | null {
  const raw = import.meta.env.VITE_WHATSAPP_NUMBER;
  const candidate = typeof raw === 'string' ? raw : AUTHORIZED_WHATSAPP_NUMBER;
  const normalized = candidate.trim().replace(/^\+/u, '');
  return /^\d{8,15}$/u.test(normalized) ? normalized : null;
}

export function getAuthorizedMercadoPagoPaymentLink(): string | null {
  const raw = import.meta.env.VITE_MERCADO_PAGO_PAYMENT_LINK;
  const candidate = typeof raw === 'string'
    ? raw.trim()
    : AUTHORIZED_MERCADO_PAGO_PAYMENT_LINK;
  if (candidate === '') return null;

  try {
    const url = new URL(candidate);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'link.mercadopago.com.ar' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

export function isCommerceClientEnabled(): boolean {
  return import.meta.env.VITE_COMMERCE_ENABLED === 'true';
}

export function isAnalyticsClientEnabled(): boolean {
  return import.meta.env.VITE_ANALYTICS_ENABLED === 'true';
}
