export function getAuthorizedWhatsappNumber(): string | null {
  const raw = import.meta.env.VITE_WHATSAPP_NUMBER;
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().replace(/^\+/u, '');
  return /^\d{8,15}$/u.test(normalized) ? normalized : null;
}

export function isCommerceClientEnabled(): boolean {
  return import.meta.env.VITE_COMMERCE_ENABLED === 'true';
}

export function isAnalyticsClientEnabled(): boolean {
  return import.meta.env.VITE_ANALYTICS_ENABLED === 'true';
}
