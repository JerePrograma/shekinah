const AUTHORIZED_WHATSAPP_NUMBER = '5492236216559';

export function getAuthorizedWhatsappNumber(): string | null {
  const raw = import.meta.env.VITE_WHATSAPP_NUMBER;
  const candidate = typeof raw === 'string' ? raw : AUTHORIZED_WHATSAPP_NUMBER;
  const normalized = candidate.trim().replace(/^\+/u, '');
  return /^\d{8,15}$/u.test(normalized) ? normalized : null;
}

export function isCommerceClientEnabled(): boolean {
  return import.meta.env.VITE_COMMERCE_ENABLED === 'true';
}

export function isMercadoLibreCatalogClientEnabled(): boolean {
  return import.meta.env.VITE_MERCADO_LIBRE_CATALOG_ENABLED === 'true';
}

export function isAnalyticsClientEnabled(): boolean {
  return import.meta.env.VITE_ANALYTICS_ENABLED === 'true';
}
