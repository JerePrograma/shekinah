import { parseMarketingCampaign, parseMarketingCampaignsResponse, parsePublicMarketingResponse } from '../commerce/marketing-contracts';
import type { MarketingCampaignInput } from '../commerce/marketing-contracts';

export class MarketingSessionExpired extends Error {}

export async function loadAdminMarketing(signal?: AbortSignal) {
  return parseMarketingCampaignsResponse(await request('/api/admin/marketing', { signal }));
}

export async function saveMarketingCampaign(input: MarketingCampaignInput, id?: string, creationKey?: string) {
  const value: unknown = await request('/api/admin/marketing', {
    method: id === undefined ? 'POST' : 'PUT',
    headers: { 'content-type': 'application/json', ...(id === undefined && creationKey !== undefined ? { 'Idempotency-Key': creationKey } : {}) },
    body: JSON.stringify(id === undefined ? input : { id, ...input }),
  });
  if (!record(value)) throw new Error('La respuesta de la campaña no es válida.');
  return parseMarketingCampaign(value.campaign);
}

export async function loadPublicMarketing(signal?: AbortSignal) {
  return parsePublicMarketingResponse(await request('/api/marketing', { signal }));
}

async function request(path: string, init: Omit<RequestInit, 'signal'> & { signal?: AbortSignal | undefined }): Promise<unknown> {
  const { signal, ...options } = init;
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', redirect: 'error', ...options, ...(signal === undefined ? {} : { signal }) });
  } catch {
    throw new Error(init.method === 'POST' || init.method === 'PUT'
      ? 'No pudimos confirmar el guardado. Reintentá para recuperar la misma campaña.'
      : 'No pudimos cargar las campañas. Revisá tu conexión y reintentá.');
  }
  if (response.status === 401) throw new MarketingSessionExpired('Tu sesión venció. Volvé a ingresar.');
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new Error('No pudimos interpretar la respuesta. Actualizá las campañas para comprobar su estado.'); }
  if (!response.ok) {
    throw new Error(record(value) && record(value.error) && typeof value.error.message === 'string'
      ? value.error.message : 'No pudimos completar la operación. Reintentá.');
  }
  return value;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
