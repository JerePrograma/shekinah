export type MarketingCampaign = Readonly<{
  id: string;
  type: 'coupon' | 'automatic' | 'announcement';
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  placement: 'announcement' | 'home';
  priority: number;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  percentOff: number | null;
  code: string | null;
  minSubtotalMinor: number;
  maxDiscountMinor: number | null;
  productCodes: readonly string[];
  maxRedemptions: number | null;
  redemptionCount: number;
  updatedAt: string;
}>;
export type Campaign = MarketingCampaign;
export type MarketingCampaignInput = Omit<MarketingCampaign, 'id' | 'updatedAt' | 'redemptionCount'>;
export type MarketingQuoteLine = Readonly<{
  productId: string; code: string; quantity: number;
  baseUnitPriceMinor: number; unitPriceMinor: number; discountMinor: number;
}>;
export type MarketingQuote = Readonly<{
  campaignId: string | null; title: string | null; couponCode: string | null;
  subtotalMinor: number; discountMinor: number; totalMinor: number;
  lines: readonly MarketingQuoteLine[];
  campaignSnapshot?: MarketingCampaign;
}>;
export type PublicMarketing = Readonly<{
  announcements: readonly MarketingCampaign[];
  promotions: readonly MarketingCampaign[];
}>;

const campaignKeys = ['id', 'type', 'title', 'body', 'ctaLabel', 'href', 'placement', 'priority', 'enabled',
  'startsAt', 'endsAt', 'percentOff', 'code', 'minSubtotalMinor', 'maxDiscountMinor', 'productCodes',
  'maxRedemptions', 'redemptionCount', 'updatedAt'] as const;

function invalid(): never { throw new Error('La información de promociones no es válida.'); }
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function exact(row: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(row, key))) invalid();
}
function text(value: unknown, max: number, min = 0, allowNewlines = false): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length < min || value.length > max ||
      [...value].some(char => { const code = char.codePointAt(0) ?? 0;
        return (code < 32 && !(allowNewlines && (code === 10 || code === 13))) || code === 127; })) return invalid();
  return value;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return invalid();
  return value;
}
function nullableInteger(value: unknown, min = 0): number | null { return value === null ? null : integer(value, min); }
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return invalid();
  return value;
}
export function normalizeCouponCode(value: string): string { return value.trim().toUpperCase(); }
export function isSafeMarketingHref(value: string): boolean {
  if (value === '') return true;
  const controls = (entry: string) => [...entry].some(char => (char.codePointAt(0) ?? 0) < 32 || char.codePointAt(0) === 127);
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\s]/u.test(value) || controls(value)) return false;
  try {
    const decoded = decodeURIComponent(value);
    return !decoded.startsWith('//') && !decoded.includes('\\') && !controls(decoded);
  } catch { return false; }
}

export function parseMarketingCampaign(value: unknown): MarketingCampaign {
  const row = record(value); exact(row, campaignKeys);
  const id = text(row.id, 64, 1);
  if (!/^mkt_[A-Za-z0-9_-]{16,60}$/u.test(id) || !['coupon', 'automatic', 'announcement'].includes(String(row.type)) ||
      (row.placement !== 'announcement' && row.placement !== 'home') || typeof row.enabled !== 'boolean') return invalid();
  const title = text(row.title, 140, 1), body = text(row.body, 1000, 0, true), ctaLabel = text(row.ctaLabel, 60), href = text(row.href, 500);
  if (!isSafeMarketingHref(href) || (href === '') !== (ctaLabel === '')) return invalid();
  const startsAt = row.startsAt === null ? null : timestamp(row.startsAt);
  const endsAt = row.endsAt === null ? null : timestamp(row.endsAt);
  if (startsAt !== null && endsAt !== null && startsAt >= endsAt) return invalid();
  const percentOff = row.percentOff === null ? null : integer(row.percentOff, 1, 90);
  const code = row.code === null ? null : text(row.code, 32, 3);
  if ((row.type === 'coupon' && (code === null || !/^[A-Z0-9][A-Z0-9_-]{2,31}$/u.test(code))) ||
      (row.type !== 'coupon' && code !== null) ||
      (row.type === 'announcement' ? percentOff !== null : percentOff === null)) return invalid();
  if (!Array.isArray(row.productCodes) || row.productCodes.length > 500) return invalid();
  const productCodes = row.productCodes.map(value => text(value, 300, 1));
  if (new Set(productCodes).size !== productCodes.length) return invalid();
  const minSubtotalMinor = integer(row.minSubtotalMinor);
  const maxDiscountMinor = nullableInteger(row.maxDiscountMinor, 1);
  const maxRedemptions = nullableInteger(row.maxRedemptions, 1);
  if (row.type === 'announcement' && (minSubtotalMinor !== 0 || maxDiscountMinor !== null || maxRedemptions !== null || productCodes.length !== 0)) return invalid();
  return Object.freeze({ id, type: row.type as MarketingCampaign['type'], title, body, ctaLabel, href,
    placement: row.placement, priority: integer(row.priority, -1000, 1000), enabled: row.enabled, startsAt, endsAt,
    percentOff, code, minSubtotalMinor, maxDiscountMinor, productCodes: Object.freeze(productCodes),
    maxRedemptions, redemptionCount: integer(row.redemptionCount), updatedAt: timestamp(row.updatedAt) });
}

export function parseMarketingCampaignsResponse(value: unknown): Readonly<{ campaigns: readonly MarketingCampaign[] }> {
  const row = record(value); exact(row, ['campaigns']);
  if (!Array.isArray(row.campaigns)) return invalid();
  return Object.freeze({ campaigns: Object.freeze(row.campaigns.map(parseMarketingCampaign)) });
}
export function parsePublicMarketingResponse(value: unknown): PublicMarketing {
  const row = record(value); exact(row, ['announcements', 'promotions']);
  if (!Array.isArray(row.announcements) || !Array.isArray(row.promotions)) return invalid();
  const announcements = row.announcements.map(parseMarketingCampaign), promotions = row.promotions.map(parseMarketingCampaign);
  if (announcements.some(item => item.type !== 'announcement') || promotions.some(item => item.type !== 'automatic')) return invalid();
  return Object.freeze({ announcements: Object.freeze(announcements), promotions: Object.freeze(promotions) });
}

export function parseMarketingQuote(value: unknown): MarketingQuote {
  const row = record(value);
  exact(row, ['campaignId', 'title', 'couponCode', 'subtotalMinor', 'discountMinor', 'totalMinor', 'lines',
    ...(Object.hasOwn(row, 'campaignSnapshot') ? ['campaignSnapshot'] : [])]);
  if (!Array.isArray(row.lines) || row.lines.length < 1 || row.lines.length > 99) return invalid();
  const lines = row.lines.map(value => {
    const line = record(value); exact(line, ['productId', 'code', 'quantity', 'baseUnitPriceMinor', 'unitPriceMinor', 'discountMinor']);
    const baseUnitPriceMinor = integer(line.baseUnitPriceMinor, 1), unitPriceMinor = integer(line.unitPriceMinor, 1);
    const quantity = integer(line.quantity, 1, 99), discountMinor = integer(line.discountMinor);
    if (unitPriceMinor > baseUnitPriceMinor || discountMinor !== (baseUnitPriceMinor - unitPriceMinor) * quantity) return invalid();
    return Object.freeze({ productId: text(line.productId, 200, 1), code: text(line.code, 300, 1), quantity,
      baseUnitPriceMinor, unitPriceMinor, discountMinor });
  });
  if (new Set(lines.map(line => line.code)).size !== lines.length || new Set(lines.map(line => line.productId)).size !== lines.length) return invalid();
  const subtotalMinor = integer(row.subtotalMinor, 1), discountMinor = integer(row.discountMinor), totalMinor = integer(row.totalMinor, 1);
  if (subtotalMinor !== lines.reduce((sum, line) => sum + line.baseUnitPriceMinor * line.quantity, 0) ||
      discountMinor !== lines.reduce((sum, line) => sum + line.discountMinor, 0) || totalMinor !== subtotalMinor - discountMinor) return invalid();
  const campaignId = row.campaignId === null ? null : text(row.campaignId, 64, 1);
  const title = row.title === null ? null : text(row.title, 140, 1);
  const couponCode = row.couponCode === null ? null : text(row.couponCode, 32, 3);
  const campaignSnapshot = row.campaignSnapshot === undefined ? undefined : parseMarketingCampaign(row.campaignSnapshot);
  if ((campaignId !== null && !/^mkt_[A-Za-z0-9_-]{16,60}$/u.test(campaignId)) ||
      (couponCode !== null && !/^[A-Z0-9][A-Z0-9_-]{2,31}$/u.test(couponCode))) return invalid();
  if ((discountMinor === 0 && (campaignId !== null || title !== null || couponCode !== null || campaignSnapshot !== undefined)) ||
      (discountMinor > 0 && (campaignId === null || title === null)) ||
      (campaignSnapshot !== undefined && (campaignSnapshot.id !== campaignId || campaignSnapshot.title !== title || campaignSnapshot.code !== couponCode || campaignSnapshot.type === 'announcement'))) return invalid();
  return Object.freeze({ campaignId, title, couponCode, subtotalMinor, discountMinor, totalMinor,
    lines: Object.freeze(lines), ...(campaignSnapshot === undefined ? {} : { campaignSnapshot }) });
}
