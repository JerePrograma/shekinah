import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createTestD1 } from '../src/test/d1';
import {
  exportAnalyticsCsv,
  getAdminSummary,
  getAnalyticsFunnel,
  getAnalyticsProducts,
  getAnalyticsTrend,
  parseAdminRange,
  toCsv,
} from './admin';

const migrations = ['0001_commerce.sql', '0006_analytics_manual_payment_click.sql']
  .map((file) => readFileSync(resolve(process.cwd(), 'migrations', file), 'utf8'));

describe('administración de sólo lectura', () => {
  it('neutraliza fórmulas y escapa celdas CSV', () => {
    const csv = toCsv(
      ['igual', 'más', 'menos', 'arroba', 'tab', 'texto', 'nulo', 'teléfono'],
      [[
        '  =SUM(A1:A2)', '+CMD', '-CMD', '@IMPORT', '\t=SUM(A1:A2)',
        'línea 1\nlínea "2"', null, '+5491155554444',
      ]],
    );
    expect(csv).toContain("\"'  =SUM(A1:A2)\"");
    expect(csv).toContain("\"'+CMD\"");
    expect(csv).toContain("\"'-CMD\"");
    expect(csv).toContain("\"'@IMPORT\"");
    expect(csv).toContain("\"'\t=SUM(A1:A2)\"");
    expect(csv).toContain('"línea 1\nlínea ""2"""');
    expect(csv).toContain(',"","\'+5491155554444"');
  });

  it('limita fechas, filas y paginación', () => {
    const range = parseAdminRange(new Request(
      'https://example.test/api/admin/orders?from=2026-07-01&to=2026-07-31&limit=100&offset=0',
    ));
    expect(range.limit).toBe(100);
    expect(() => parseAdminRange(new Request(
      'https://example.test/api/admin/orders?limit=10000',
    ))).toThrowError(expect.objectContaining({ code: 'INVALID_PAGINATION' }));
  });

  it('separa interacciones de finanzas confirmadas y usa sesiones únicas', async () => {
    const testD1 = createTestD1(...migrations);
    const range = reportRange('2026-08-09', '2026-08-11');
    try {
      seedAnalytics(testD1.sqlite);
      seedOrdersAndPayments(testD1.sqlite);

      await expect(getAdminSummary(testD1.database, range)).resolves.toMatchObject({
        order_count: 3,
        approved_revenue_minor: 10_000,
        approved_count: 1,
        approved_payment_count: 2,
        pending_count: 1,
        average_ticket_minor: 10_000,
        consented_session_count: 2,
        page_view_count: 3,
        page_view_session_count: 2,
        product_view_session_count: 2,
        cart_add_session_count: 2,
        manual_payment_click_count: 2,
        manual_payment_click_session_count: 1,
        whatsapp_open_count: 1,
        whatsapp_open_session_count: 1,
      });

      await expect(getAnalyticsFunnel(testD1.database, range)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event_name: 'manual_payment_click',
            event_count: 2,
            session_count: 1,
          }),
          expect.objectContaining({
            event_name: 'whatsapp_open',
            event_count: 1,
            session_count: 1,
          }),
        ]),
      );

      await expect(getAnalyticsProducts(testD1.database, range)).resolves.toEqual([
        expect.objectContaining({
          product_id: 'producto-uno',
          views: 3,
          cart_adds: 1,
          view_sessions: 2,
          cart_add_sessions: 1,
          converted_sessions: 1,
        }),
        expect.objectContaining({
          product_id: 'producto-dos',
          views: 0,
          cart_adds: 1,
          view_sessions: 0,
          cart_add_sessions: 1,
          converted_sessions: 0,
        }),
      ]);

      const trend = await getAnalyticsTrend(testD1.database, range);
      expect(trend).toEqual([
        expect.objectContaining({ day: '2026-08-09', session_count: 0 }),
        expect.objectContaining({
          day: '2026-08-10',
          session_count: 2,
          manual_payment_click_count: 2,
          whatsapp_open_count: 1,
        }),
        expect.objectContaining({ day: '2026-08-11', session_count: 0 }),
      ]);

      await expect(exportAnalyticsCsv(testD1.database, range)).resolves.toContain(
        '"manual_payment_click","/carrito"',
      );
    } finally {
      testD1.close();
    }
  });
});

function reportRange(from: string, to: string) {
  return parseAdminRange(new Request(
    `https://example.test/api/admin/summary?from=${from}&to=${to}&limit=100`,
  ));
}

function seedAnalytics(database: ReturnType<typeof createTestD1>['sqlite']): void {
  const timestamp = '2026-08-10T12:00:00.000Z';
  for (const session of ['session-one', 'session-two']) {
    database.prepare(`INSERT INTO analytics_sessions (
      session_hash, consent_version, created_at, updated_at
    ) VALUES (?, '1', ?, ?)`).run(session, timestamp, timestamp);
  }
  const events = [
    ['page-1', 'session-one', 'page_view', '/', null],
    ['page-2', 'session-one', 'page_view', '/catalogo', null],
    ['product-1', 'session-one', 'product_view', '/producto-uno', 'producto-uno'],
    ['product-2', 'session-one', 'product_view', '/producto-uno', 'producto-uno'],
    ['cart-1', 'session-one', 'cart_add', '/catalogo', 'producto-uno'],
    ['manual-1', 'session-one', 'manual_payment_click', '/carrito', null],
    ['manual-2', 'session-one', 'manual_payment_click', '/carrito', null],
    ['whatsapp-1', 'session-one', 'whatsapp_open', '/carrito', null],
    ['page-3', 'session-two', 'page_view', '/', null],
    ['product-3', 'session-two', 'product_view', '/producto-uno', 'producto-uno'],
    ['cart-2', 'session-two', 'cart_add', '/catalogo', 'producto-dos'],
  ] as const;
  for (const [id, session, name, path, product] of events) {
    database.prepare(`INSERT INTO analytics_events (
      id, session_hash, event_name, path, product_id, source, device_class, created_at
    ) VALUES (?, ?, ?, ?, ?, 'direct', 'desktop', ?)`)
      .run(id, session, name, path, product, timestamp);
  }
}

function seedOrdersAndPayments(database: ReturnType<typeof createTestD1>['sqlite']): void {
  insertOrder(database, 'ord_confirmed_12345678901234567890', 'approved', 10_000);
  insertOrder(database, 'ord_without_payment_123456789012345', 'approved', 20_000);
  insertOrder(database, 'ord_pending_1234567890123456789012', 'pending', 30_000);
  insertPayment(database, 'payment-compatible', 'ord_confirmed_12345678901234567890', 10_000);
  insertPayment(database, 'payment-compatible-repeated', 'ord_confirmed_12345678901234567890', 10_000);
  insertPayment(database, 'payment-incompatible', 'ord_confirmed_12345678901234567890', 9_999);
}

function insertOrder(
  database: ReturnType<typeof createTestD1>['sqlite'],
  id: string,
  status: string,
  totalMinor: number,
): void {
  database.prepare(`INSERT INTO orders (
    id, public_token_hash, checkout_idempotency_key, cart_fingerprint, status,
    currency, total_minor, item_count, created_at, updated_at, approved_at
  ) VALUES (?, ?, ?, ?, ?, 'ARS', ?, 1, ?, ?, ?)`)
    .run(
      id,
      `token-${id}`,
      `key-${id}`,
      `cart-${id}`,
      status,
      totalMinor,
      '2026-08-10T12:00:00.000Z',
      '2026-08-10T12:00:00.000Z',
      status === 'approved' ? '2026-08-10T12:05:00.000Z' : null,
    );
}

function insertPayment(
  database: ReturnType<typeof createTestD1>['sqlite'],
  paymentId: string,
  orderId: string,
  amountMinor: number,
): void {
  database.prepare(`INSERT INTO payments (
    provider_payment_id, order_id, mapped_status, provider_status, status_detail,
    amount_minor, currency, external_reference, approved_at, provider_updated_at,
    last_event_key, created_at, updated_at
  ) VALUES (?, ?, 'approved', 'approved', 'accredited', ?, 'ARS', ?, ?, ?, ?, ?, ?)`)
    .run(
      paymentId,
      orderId,
      amountMinor,
      orderId,
      '2026-08-10T12:05:00.000Z',
      '2026-08-10T12:05:00.000Z',
      `event-${paymentId}`,
      '2026-08-10T12:00:00.000Z',
      '2026-08-10T12:05:00.000Z',
    );
}
