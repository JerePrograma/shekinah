import { normalizeCouponCode, parseMarketingCampaign, parseMarketingQuote } from '../src/commerce/marketing-contracts';
import type { MarketingCampaign, MarketingCampaignInput, MarketingQuote, PublicMarketing } from '../src/commerce/marketing-contracts';
import { HttpError, requireSecret } from './http';
import { hmacSha256Hex } from './crypto';
import { prepareWebRequestLimit } from './web-request-rate-limit';
import type { D1Database, D1PreparedStatement } from './platform';
import { assertExactKeys, assertUuid, isRecord } from './validation';

type Row = Readonly<{
  id: string; type: string; title: string; body: string; cta_label: string; href: string; placement: string;
  priority: number; enabled: number; starts_at: string | null; ends_at: string | null;
  percent_off: number | null; code: string | null; min_subtotal_minor: number; max_discount_minor: number | null;
  product_codes_json: string; max_redemptions: number | null; redemption_count: number; updated_at: string;
}>;
export type MarketingBaseLine = Readonly<{ productId: string; code: string; quantity: number; unitPriceMinor: number }>;
const selectCampaigns = `SELECT c.*, (SELECT count(*) FROM marketing_redemptions r WHERE r.campaign_id = c.id) AS redemption_count FROM marketing_campaigns c`;
const inputKeys = ['type','title','body','ctaLabel','href','placement','priority','enabled','startsAt','endsAt',
  'percentOff','code','minSubtotalMinor','maxDiscountMinor','productCodes','maxRedemptions'] as const;

/** Separate namespace: coupon attempts cannot exhaust checkout/recovery budgets. */
export async function consumeMarketingCouponAttempt(database: D1Database, request: Request, secretValue: string | undefined,
  now = new Date()): Promise<void> {
  const secret = requireSecret(secretValue,'MARKETING_UNAVAILABLE','Los cupones no están disponibles temporalmente.');
  const seconds = Math.floor(now.getTime() / 1000), day = Math.floor(seconds / 86400);
  const raw = request.headers.get('cf-connecting-ip')?.trim() ?? '';
  const ip = /^[0-9a-f:.]{2,64}$/iu.test(raw) ? raw.toLowerCase() : 'unavailable';
  const digest = await hmacSha256Hex(secret,`marketing-coupon-ip:${day}:${ip}`);
  const scopes = [{key:`marketing:global:${day}`,limit:5000},
    {key:`marketing:ip:${Math.floor(seconds/900)}:${digest}`,limit:30}];
  try {
    await database.batch([...scopes.map(scope => prepareWebRequestLimit(database,scope,seconds)),
      database.prepare(`DELETE FROM commerce_request_rate_limits WHERE scope_key IN (
        SELECT scope_key FROM commerce_request_rate_limits WHERE scope_key LIKE 'marketing:%' AND updated_at < ?
        ORDER BY updated_at LIMIT 50)`).bind(seconds-172800)]);
  } catch (error: unknown) {
    const message = isRecord(error) && typeof error.message === 'string' ? error.message : '';
    if (message.includes('commerce_request_limit')) {
      throw new HttpError(429,'MARKETING_RATE_LIMITED','Se alcanzó el límite de intentos de cupón. Intentá nuevamente más tarde.');
    }
    throw new HttpError(503,'MARKETING_UNAVAILABLE','Los cupones no están disponibles temporalmente.');
  }
}

function timestamp(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new TypeError('La fecha de promociones no es válida.');
  return now.toISOString();
}
function missingSchema(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /no such table:\s*(?:main\.)?marketing_(?:campaigns|redemptions)(?:\b|$)/iu.test(error.message) ||
    (error.cause !== undefined && error.cause !== error && missingSchema(error.cause));
}
function fromRow(row: Row): MarketingCampaign {
  return parseMarketingCampaign({ id: row.id, type: row.type, title: row.title, body: row.body, ctaLabel: row.cta_label,
    href: row.href, placement: row.placement, priority: row.priority, enabled: row.enabled === 1,
    startsAt: row.starts_at, endsAt: row.ends_at, percentOff: row.percent_off, code: row.code,
    minSubtotalMinor: row.min_subtotal_minor, maxDiscountMinor: row.max_discount_minor,
    productCodes: JSON.parse(row.product_codes_json) as unknown, maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count, updatedAt: row.updated_at });
}
function active(campaign: MarketingCampaign, nowISO: string): boolean {
  return campaign.enabled && (campaign.startsAt === null || campaign.startsAt <= nowISO) &&
    (campaign.endsAt === null || campaign.endsAt > nowISO) &&
    (campaign.maxRedemptions === null || campaign.redemptionCount < campaign.maxRedemptions);
}
export async function listMarketingCampaigns(database: D1Database): Promise<readonly MarketingCampaign[]> {
  const result = await database.prepare(`${selectCampaigns} ORDER BY c.priority DESC, c.id ASC`).all<Row>();
  if (!result.success) throw new Error(result.error ?? 'No se pudieron leer las promociones.');
  return (result.results ?? []).map(fromRow);
}
export async function readPublicMarketing(database: D1Database, now = new Date()): Promise<PublicMarketing> {
  let campaigns: readonly MarketingCampaign[];
  try { campaigns = await listMarketingCampaigns(database); }
  catch (error: unknown) { if (missingSchema(error)) return { announcements: [], promotions: [] }; throw error; }
  const current = campaigns.filter(campaign => campaign.type !== 'coupon' && active(campaign, timestamp(now)));
  return { announcements: current.filter(campaign => campaign.type === 'announcement'),
    promotions: current.filter(campaign => campaign.type === 'automatic') };
}

export function parseMarketingCampaignInput(value: unknown, now = new Date()): MarketingCampaignInput {
  if (!isRecord(value)) throw invalidCampaign();
  assertExactKeys(value, inputKeys, 'INVALID_MARKETING_CAMPAIGN', 'La campaña contiene campos no permitidos.');
  if (typeof value.code === 'string' && !/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/u.test(value.code.trim())) throw invalidCampaign();
  try {
    const parsed = parseMarketingCampaign({ ...value,
      code: typeof value.code === 'string' ? normalizeCouponCode(value.code) : value.code,
      id: 'mkt_validation00000000', updatedAt: timestamp(now), redemptionCount: 0 });
    return Object.fromEntries(inputKeys.map(key => [key, parsed[key]])) as MarketingCampaignInput;
  } catch { throw invalidCampaign(); }
}
function invalidCampaign(): HttpError { return new HttpError(400, 'INVALID_MARKETING_CAMPAIGN', 'Revisá los campos de la campaña, sus fechas y el enlace interno.'); }
export async function writeMarketingCampaign(database: D1Database, value: unknown, id?: string, now = new Date(),
  creationKey?: string): Promise<MarketingCampaign> {
  const input = parseMarketingCampaignInput(value, now);
  const nowISO = timestamp(now);
  if (id !== undefined && creationKey !== undefined) throw invalidCampaign();
  const key = creationKey === undefined ? undefined : assertUuid(creationKey,'Idempotency-Key');
  const campaignId = id ?? `mkt_${(key ?? crypto.randomUUID()).replaceAll('-', '')}`;
  if (!/^mkt_[A-Za-z0-9_-]{16,60}$/u.test(campaignId)) throw invalidCampaign();
  const recoverCreation = (campaign: MarketingCampaign): MarketingCampaign => {
    const stored = Object.fromEntries(inputKeys.map(field => [field,campaign[field]]));
    if (JSON.stringify(stored) !== JSON.stringify(input)) {
      throw new HttpError(409,'MARKETING_IDEMPOTENCY_CONFLICT',
        'Esta campaña ya se guardó con otros datos. Actualizá las campañas y revisá la existente antes de continuar.');
    }
    return campaign;
  };
  if (key !== undefined) {
    const existing = await database.prepare(`${selectCampaigns} WHERE c.id = ?`).bind(campaignId).first<Row>();
    if (existing !== null) return recoverCreation(fromRow(existing));
  }
  const values = [input.type,input.title,input.body,input.ctaLabel,input.href,input.placement,input.priority,input.enabled ? 1 : 0,
    input.startsAt,input.endsAt,input.percentOff,input.code,input.minSubtotalMinor,input.maxDiscountMinor,
    JSON.stringify(input.productCodes),input.maxRedemptions,nowISO] as const;
  try {
    if (id === undefined) {
      await database.prepare(`INSERT INTO marketing_campaigns (type,title,body,cta_label,href,placement,priority,enabled,
        starts_at,ends_at,percent_off,code,min_subtotal_minor,max_discount_minor,product_codes_json,max_redemptions,updated_at,id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(...values,campaignId).run();
    } else {
      const row = await database.prepare(`UPDATE marketing_campaigns SET type=?,title=?,body=?,cta_label=?,href=?,placement=?,priority=?,enabled=?,
        starts_at=?,ends_at=?,percent_off=?,code=?,min_subtotal_minor=?,max_discount_minor=?,product_codes_json=?,max_redemptions=?,updated_at=?
        WHERE id=? RETURNING id`).bind(...values,campaignId).first();
      if (row === null) throw new HttpError(404, 'MARKETING_CAMPAIGN_NOT_FOUND', 'No se encontró la campaña.');
    }
  } catch (error: unknown) {
    if (error instanceof Error && /UNIQUE constraint failed:\s*marketing_campaigns\.code/iu.test(error.message)) {
      throw new HttpError(409, 'COUPON_CODE_EXISTS', 'Ya existe un cupón con ese código.');
    }
    throw error;
  }
  const row = await database.prepare(`${selectCampaigns} WHERE c.id = ?`).bind(campaignId).first<Row>();
  if (row === null) throw new Error('No se pudo recuperar la campaña guardada.');
  const campaign = fromRow(row);
  return key === undefined ? campaign : recoverCreation(campaign);
}

/** Never trusts browser amounts. Callers supply their authoritative Dux prices. */
export async function readMarketingQuote(database: D1Database, lines: readonly MarketingBaseLine[],
  couponCode?: string | null, now = new Date()): Promise<MarketingQuote> {
  const base = parseMarketingQuote({ campaignId: null, title: null, couponCode: null,
    subtotalMinor: lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0), discountMinor: 0,
    totalMinor: lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0),
    lines: lines.map(line => ({ ...line, baseUnitPriceMinor: line.unitPriceMinor, discountMinor: 0 })) });
  if (couponCode !== undefined && couponCode !== null && typeof couponCode !== 'string') throw invalidCoupon();
  const normalized = typeof couponCode === 'string' ? normalizeCouponCode(couponCode) : '';
  const explicit = normalized !== '';
  if (explicit && (typeof couponCode !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/u.test(couponCode.trim()))) throw invalidCoupon();
  let campaigns: readonly MarketingCampaign[];
  try { campaigns = await listMarketingCampaigns(database); }
  catch (error: unknown) {
    if (!missingSchema(error)) throw error;
    if (explicit) throw new HttpError(503, 'MARKETING_UNAVAILABLE', 'Los cupones no están disponibles temporalmente.');
    return base;
  }
  const nowISO = timestamp(now);
  const coupon = explicit ? campaigns.find(campaign => campaign.type === 'coupon' && campaign.code === normalized) : undefined;
  if (explicit && (coupon === undefined || !active(coupon, nowISO))) throw invalidCoupon();
  const candidateQuote = (campaign: MarketingCampaign): MarketingQuote => {
    if (campaign.type === 'announcement' || base.subtotalMinor < campaign.minSubtotalMinor) return base;
    let cap = campaign.maxDiscountMinor ?? Number.MAX_SAFE_INTEGER;
    const discounts = new Map<string, number>();
    // Stable ordering makes a capped quote independent of cart display order.
    for (const line of [...lines].sort((a,b) => a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0)) {
      const eligible = campaign.productCodes.length === 0 || campaign.productCodes.includes(line.code);
      const roundedDiscount = Number((BigInt(line.unitPriceMinor) * BigInt(campaign.percentOff ?? 0) + 50n) / 100n);
      const perUnit = eligible ? Math.min(roundedDiscount,
        line.unitPriceMinor - 1, Math.floor(cap / line.quantity)) : 0;
      discounts.set(line.productId, perUnit);
      cap -= perUnit * line.quantity;
    }
    const quoteLines = lines.map(line => {
      const perUnit = discounts.get(line.productId) ?? 0;
      return { ...line, baseUnitPriceMinor: line.unitPriceMinor, unitPriceMinor: line.unitPriceMinor - perUnit,
        discountMinor: perUnit * line.quantity };
    });
    const discountMinor = quoteLines.reduce((sum,line) => sum + line.discountMinor, 0);
    return discountMinor === 0 ? base : parseMarketingQuote({ campaignId: campaign.id,title: campaign.title,
      couponCode: campaign.code,subtotalMinor: base.subtotalMinor,discountMinor,totalMinor: base.subtotalMinor - discountMinor,
      lines: quoteLines,campaignSnapshot: campaign });
  };
  if (coupon !== undefined && candidateQuote(coupon).discountMinor === 0) {
    throw new HttpError(400, 'COUPON_NOT_APPLICABLE', 'El cupón no aplica a este carrito o no alcanza el mínimo requerido.');
  }
  let best = base;
  for (const campaign of campaigns) {
    if (!active(campaign, nowISO) || (campaign.type !== 'automatic' && campaign.id !== coupon?.id)) continue;
    const quote = candidateQuote(campaign);
    if (quote.discountMinor > best.discountMinor) best = quote;
  }
  return best;
}
function invalidCoupon(): HttpError { return new HttpError(400, 'INVALID_COUPON', 'El cupón no existe, venció o ya no tiene cupos disponibles.'); }

/** Include after order INSERT, before order items, in the same atomic D1 batch. */
export function reserveMarketingRedemptionStatements(database: D1Database, orderId: string, value: MarketingQuote,
  nowISO: string): readonly D1PreparedStatement[] {
  const quote = parseMarketingQuote(value);
  if (quote.campaignId === null) return [];
  if (quote.campaignSnapshot === undefined || orderId.trim() === '' || orderId.length > 200 || timestamp(new Date(nowISO)) !== nowISO) {
    throw new TypeError('La reserva de promoción no tiene evidencia válida.');
  }
  return [database.prepare(`INSERT INTO marketing_redemptions (order_id,campaign_id,campaign_snapshot_json,quote_json,created_at)
    VALUES (?,?,?,?,?) ON CONFLICT(order_id) DO NOTHING`).bind(orderId,quote.campaignId,
    JSON.stringify(quote.campaignSnapshot),JSON.stringify(quote),nowISO)];
}
