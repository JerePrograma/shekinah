import { HttpError, requireSecret, requireText } from './http';
import type { CommerceMode, Env } from './platform';

export const MERCADO_PAGO_APPLICATION_ID = '7373984348988262';

export function requireEnabledFlag(
  value: string | undefined,
  code: string,
  message: string,
): void {
  if (value !== 'true') throw new HttpError(503, code, message);
}

export function isEnabledFlag(value: string | undefined): boolean {
  return value === 'true';
}

export function requireCommerceMode(env: Env): CommerceMode {
  const value = requireText(
    env.MERCADO_PAGO_CHECKOUT_MODE,
    'PAYMENT_MODE_MISSING',
    'El modo de Mercado Pago no está configurado.',
  );
  if (value !== 'sandbox' && value !== 'production') {
    throw new HttpError(503, 'PAYMENT_MODE_INVALID', 'El modo de Mercado Pago no es válido.');
  }
  return value;
}

export function requireMercadoPagoAccessToken(env: Env, mode: CommerceMode): string {
  const accessToken = requireSecret(
    env.MERCADO_PAGO_ACCESS_TOKEN,
    'PAYMENT_CREDENTIALS_MISSING',
    'Mercado Pago no está configurado.',
    20,
  );
  if (mode === 'production') {
    const clientId = /^APP_USR-(\d{1,30})-/u.exec(accessToken)?.[1];
    if (clientId !== MERCADO_PAGO_APPLICATION_ID) {
      throw new HttpError(
        503,
        'PAYMENT_APPLICATION_MISMATCH',
        'Mercado Pago no está configurado para la aplicación autorizada.',
      );
    }
  }
  return accessToken;
}

export function requirePublicSiteUrl(env: Env): URL {
  const value = requireText(
    env.PUBLIC_SITE_URL,
    'SITE_URL_MISSING',
    'La URL pública no está configurada.',
  );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(503, 'SITE_URL_INVALID', 'La URL pública no es válida.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new HttpError(503, 'SITE_URL_INVALID', 'La URL pública debe ser un origen HTTPS sin ruta.');
  }
  return new URL(url.origin);
}

export function readAnalyticsRetentionDays(env: Env): number | null {
  if (env.ANALYTICS_RETENTION_DAYS === undefined || env.ANALYTICS_RETENTION_DAYS === '') {
    return null;
  }
  const value = Number(env.ANALYTICS_RETENTION_DAYS);
  if (!Number.isSafeInteger(value) || value < 1 || value > 730) {
    throw new HttpError(503, 'ANALYTICS_RETENTION_INVALID', 'La retención analítica no es válida.');
  }
  return value;
}

export function readMercadoLibreCatalogMaxAgeSeconds(env: Env): number {
  const raw = env.MERCADO_LIBRE_CATALOG_MAX_AGE_SECONDS ?? '900';
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 60 || value > 3_600) {
    throw new HttpError(
      503,
      'MERCADO_LIBRE_MAX_AGE_INVALID',
      'El umbral de frescura de Mercado Libre no es válido.',
    );
  }
  return value;
}
