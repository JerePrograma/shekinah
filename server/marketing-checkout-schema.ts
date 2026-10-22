import { HttpError } from './http';
import type { D1Database } from './platform';

const guards = ['marketing_campaigns', 'marketing_redemptions', 'marketing_redemption_insert_guard',
  'marketing_redemption_identity_guard', 'marketing_redemption_immutable_update', 'marketing_redemption_immutable_delete',
  'dux_automatic_marketing_order_item_guard', 'dux_automatic_marketing_redemption_guard'] as const;

export async function hasMarketingCheckoutSchema(database: D1Database): Promise<boolean> {
  const result = await database.prepare(`SELECT name FROM sqlite_schema WHERE name IN (${guards.map(() => '?').join(',')})`)
    .bind(...guards).all<{ name: string }>();
  return new Set(result.results?.map(row => row.name)).size === guards.length;
}

export async function requireMarketingCheckoutSchema(database: D1Database): Promise<void> {
  if (!(await hasMarketingCheckoutSchema(database))) {
    throw new HttpError(503, 'MARKETING_CHECKOUT_MIGRATION_REQUIRED', 'Los descuentos todavía no están disponibles para pagar.');
  }
}
