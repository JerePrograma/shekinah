import { HttpError } from './http';
import type { D1Database } from './platform';

export const DIRECT_CHECKOUT_GUARDS = [
  'dux_api_request_gate', 'idx_direct_checkout_preparation', 'idx_dux_verified_order_number_unique',
  'dux_automatic_link_initial_guard', 'dux_automatic_reserve_initial_guard',
  'dux_automatic_order_items_guard', 'dux_automatic_request_immutable',
  'dux_automatic_reserve_confirm_guard', 'dux_automatic_reservation_transition_guard',
  'dux_automatic_order_status_guard', 'automatic_checkout_preference_guard',
  'dux_automatic_lifecycle_operation_guard', 'dux_automatic_lifecycle_evidence_guard',
  'dux_automatic_fulfillment_transition_guard', 'dux_order_automatic_identity_immutable',
  'dux_automatic_release_financial_guard', 'dux_automatic_finalize_financial_guard',
  'dux_automatic_attempt_immutable', 'dux_automatic_operation_preserve_history',
  'dux_automatic_link_identity_guard', 'dux_automatic_confirmed_operation_immutable',
] as const;

export async function requireDirectCheckoutSchema(database: D1Database): Promise<void> {
  try {
    const result = await database.prepare(`SELECT name FROM sqlite_schema WHERE name IN (${DIRECT_CHECKOUT_GUARDS.map(() => '?').join(',')})`)
      .bind(...DIRECT_CHECKOUT_GUARDS).all<{ name: string }>();
    if (new Set(result.results?.map(row => row.name)).size !== DIRECT_CHECKOUT_GUARDS.length) throw missing();
    await database.prepare(`SELECT direct_checkout_state, direct_checkout_claim_token,
      direct_checkout_updated_at, direct_checkout_error_code, direct_checkout_progress_json,
      direct_checkout_lease_until_ms FROM checkout_intents LIMIT 0`).all();
  } catch { throw missing(); }
}

function missing(): HttpError {
  return new HttpError(503, 'DIRECT_CHECKOUT_MIGRATION_REQUIRED', 'La compra directa todavía no está disponible.');
}
