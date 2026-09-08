import { assertDirectMercadoLibreInventoryDisabled, MERCADO_PAGO_APPLICATION_ID, rejectDirectMercadoLibreIntegration } from './config';
import { HttpError } from './http';
import { getMercadoLibreAccess, mercadoLibreApiJson } from './mercado-libre';
import { EDITORIAL_SELLER_ID } from './mercado-libre-editorial-policy';
import type { D1Database, Env } from './platform';

export function requireMercadoLibreEditorial(env: Env): void {
  if (env.MERCADO_LIBRE_EDITORIAL_ENABLED !== 'true') rejectDirectMercadoLibreIntegration();
  assertDirectMercadoLibreInventoryDisabled(env);
  if (env.DUX_COMPANY_ID !== '12862' || env.MERCADO_LIBRE_EXPECTED_SELLER_ID !== EDITORIAL_SELLER_ID) {
    throw new HttpError(503, 'ML_EDITORIAL_CONTEXT_INVALID', 'El contexto editorial autorizado no está configurado.');
  }
  if (env.MERCADO_LIBRE_CLIENT_ID === MERCADO_PAGO_APPLICATION_ID) {
    throw new HttpError(503, 'ML_EDITORIAL_APPLICATION_INVALID', 'Mercado Libre requiere su aplicación editorial independiente de pagos.');
  }
}

/** Only the official metadata/description resources are available to the editorial reader. */
export async function editorialApiGet(database: D1Database, env: Env, path: string): Promise<unknown> {
  requireMercadoLibreEditorial(env);
  const url = new URL(path, 'https://api.mercadolibre.com');
  if (url.origin !== 'https://api.mercadolibre.com' || url.username !== '' || url.password !== '' || url.hash !== '' ||
    !(/^\/users\/me$/u.test(url.pathname) || /^\/items\/bulk$/u.test(url.pathname) ||
      /^\/items\/MLA\d{5,25}(?:\/description)?$/u.test(url.pathname) ||
      url.pathname === `/users/${EDITORIAL_SELLER_ID}/items/search`)) {
    throw new HttpError(400, 'ML_EDITORIAL_RESOURCE_FORBIDDEN', 'El recurso no pertenece a la lectura editorial.');
  }
  const access = await getMercadoLibreAccess(database, env);
  if (access.sellerId !== EDITORIAL_SELLER_ID) throw new HttpError(403, 'ML_EDITORIAL_SELLER_MISMATCH', 'La cuenta no corresponde al vendedor autorizado.');
  return (await mercadoLibreApiJson(`${url.pathname}${url.search}`, access.accessToken)).body;
}
