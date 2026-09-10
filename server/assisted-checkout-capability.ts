import {
  isEnabledFlag,
  requireCommerceMode,
  requireMercadoPagoAccessToken,
  requirePublicSiteUrl,
} from './config';
import { requireSecret } from './http';
import type { Env } from './platform';

export function assistedCheckoutConfigured(env: Env): boolean {
  if (!isEnabledFlag(env.COMMERCE_ENABLED) || !isEnabledFlag(env.ASSISTED_CHECKOUT_ENABLED)) return false;
  try {
    const mode = requireCommerceMode(env);
    void requireMercadoPagoAccessToken(env, mode);
    void requirePublicSiteUrl(env);
    void requireSecret(env.ORDER_TOKEN_SECRET, 'ORDER_TOKEN_SECRET_MISSING', 'Configuración ausente.', 32);
    void requireSecret(env.MERCADO_PAGO_WEBHOOK_SECRET, 'WEBHOOK_SECRET_MISSING', 'Configuración ausente.', 32);
    return true;
  } catch {
    return false;
  }
}
