import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getOrderPaymentState, getPublicOrderState } from './order-payment-state';
import { listCommerceAttention } from './commerce-attention';
import { SqliteD1 } from './test/sqlite-d1';

const migration = ['0001_commerce.sql', '0012_dux_authoritative_inventory.sql']
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8')).join('\n');
const now = '2026-09-08T12:00:00.000Z';

async function order(database: SqliteD1, status = 'pending') {
  const id = `ord_${crypto.randomUUID().replaceAll('-', '')}`;
  const tokenHash = `hash-${id}`;
  await database.prepare(`INSERT INTO orders (
    id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
    status, currency, total_minor, item_count, created_at, updated_at
  ) VALUES (?, ?, ?, 'fingerprint', ?, 'ARS', 10000, 1, ?, ?)`)
    .bind(id, tokenHash, crypto.randomUUID(), status, now, now).run();
  return { id, tokenHash };
}

async function pay(database: SqliteD1, id: string, status = 'approved', amount = 10000, currency = 'ARS', reference = id) {
  await database.prepare(`INSERT INTO payments (
    provider_payment_id, order_id, mapped_status, provider_status, amount_minor,
    currency, external_reference, last_event_key, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'event', ?, ?)`)
    .bind(crypto.randomUUID(), id, status, status, amount, currency, reference, now, now).run();
}

async function link(database: SqliteD1, id: string, state: string) {
  await database.prepare(`INSERT INTO dux_order_links (
    order_id, dux_reference, company_id, branch_id, deposit_id, reservation_state,
    request_fingerprint, created_at, updated_at
  ) VALUES (?, ?, '1', '2', '3', ?, 'fingerprint', ?, ?)`)
    .bind(id, `test:${id}`, state, now, now).run();
}

describe('lectura financiera y pendientes comerciales', () => {
  it('no convierte una aprobación comercial sin payments en pago recibido', async () => {
    const db = new SqliteD1(migration);
    try {
      const item = await order(db, 'approved');
      expect(await getOrderPaymentState(db, item.id)).toEqual({ status: 'none', requiresReview: false, updatedAt: null });
    } finally { db.close(); }
  });

  it.each(['pending', 'rejected', 'cancelled', 'failed', 'refunded'])(
    'expone el pago recibido aunque el pedido permanezca %s', async (status) => {
      const db = new SqliteD1(migration);
      try {
        const item = await order(db, status);
        await link(db, item.id, 'uncertain');
        await pay(db, item.id);
        const result = await getPublicOrderState(db, item.tokenHash);
        expect(result?.status).toBe(status);
        expect(result?.payment).toEqual({ status: 'approved', requiresReview: true, updatedAt: now });
        expect(result).not.toHaveProperty('id');
        expect(result).not.toHaveProperty('dux_reference');
        expect(JSON.stringify(result)).not.toContain(item.id);
      } finally { db.close(); }
    },
  );

  it('mantiene un único pendiente para varios cobros y lecturas repetidas', async () => {
    const db = new SqliteD1(migration);
    try {
      const item = await order(db, 'approved');
      await pay(db, item.id); await pay(db, item.id);
      expect((await getOrderPaymentState(db, item.id)).requiresReview).toBe(true);
      const first = await listCommerceAttention(db);
      expect(first.rows).toHaveLength(1);
      expect(first.rows[0]?.next_action).toBe('duplicate_payment');
      expect(await listCommerceAttention(db)).toEqual(first);
      expect((await db.prepare('SELECT COUNT(*) AS count FROM payments').first())?.count).toBe(2);
    } finally { db.close(); }
  });

  it('no acredita pagos parciales ni otra moneda o referencia', async () => {
    const db = new SqliteD1(migration);
    try {
      const item = await order(db);
      await pay(db, item.id, 'approved', 5000);
      await pay(db, item.id, 'approved', 5000);
      await pay(db, item.id, 'approved', 10000, 'USD');
      await pay(db, item.id, 'approved', 10000, 'ARS', 'other');
      expect((await getOrderPaymentState(db, item.id)).status).toBe('none');
    } finally { db.close(); }
  });

  it('conserva la prioridad approved, refunded, pending y rejected de pagos exactos', async () => {
    const db = new SqliteD1(migration);
    try {
      const item = await order(db);
      for (const status of ['cancelled', 'rejected', 'pending', 'refunded', 'approved']) {
        await pay(db, item.id, status);
        expect((await getOrderPaymentState(db, item.id)).status).toBe(status);
      }
    } finally { db.close(); }
  });

  it('un reintegro no cambia la reserva ni da por liberado inventario', async () => {
    const db = new SqliteD1(migration);
    try {
      const item = await order(db);
      await link(db, item.id, 'confirmed');
      await pay(db, item.id, 'refunded');
      const before = db.database.prepare('SELECT total_changes() AS total').get();
      expect((await getOrderPaymentState(db, item.id)).status).toBe('refunded');
      expect((await listCommerceAttention(db)).rows[0]?.next_action).toBe('payment_review');
      expect(db.database.prepare('SELECT total_changes() AS total').get()).toEqual(before);
      expect((await db.prepare('SELECT reservation_state FROM dux_order_links').first())?.reservation_state).toBe('confirmed');
    } finally { db.close(); }
  });

  it.each([
    ['pending', 'reconcile'], ['uncertain', 'reconcile'], ['compensation_pending', 'release_review'],
    ['blocked', 'reservation_review'], ['not_attempted', 'reservation_review'],
  ])('proyecta %s como %s sin duplicar tareas', async (state, action) => {
    const db = new SqliteD1(migration);
    try {
      const item = await order(db);
      await link(db, item.id, state);
      const result = await listCommerceAttention(db);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.next_action).toBe(action);
      expect(await listCommerceAttention(db)).toEqual(result);
    } finally { db.close(); }
  });

  it('pagina pedidos antiguos sin esconderlos por el filtro temporal del informe', async () => {
    const db = new SqliteD1(migration);
    try {
      for (let index = 0; index < 26; index += 1) {
        const item = await order(db);
        await link(db, item.id, 'uncertain');
      }
      const first = await listCommerceAttention(db);
      const second = await listCommerceAttention(db, 25);
      expect(first.rows).toHaveLength(25); expect(first.hasMore).toBe(true);
      expect(second.rows).toHaveLength(1); expect(second.hasMore).toBe(false);
      expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(26);
      await expect(listCommerceAttention(db, -1)).rejects.toThrow();
    } finally { db.close(); }
  });

  it('no mezcla compradores y no devuelve un estado para un token inexistente', async () => {
    const db = new SqliteD1(migration);
    try {
      const first = await order(db); const second = await order(db);
      await pay(db, second.id);
      expect((await getPublicOrderState(db, first.tokenHash))?.payment?.status).toBe('none');
      expect(await getPublicOrderState(db, 'missing')).toBeNull();
    } finally { db.close(); }
  });
  it('mantiene visible un cobro posterior a liberación aunque el pedido esté aprobado', async () => {
    const db = new SqliteD1(migration);
    try {
      const item = await order(db, 'approved');
      await link(db, item.id, 'released'); await pay(db, item.id);
      expect((await listCommerceAttention(db)).rows[0]?.next_action).toBe('payment_review');
      expect((await db.prepare('SELECT reservation_state FROM dux_order_links').first())?.reservation_state).toBe('released');
    } finally { db.close(); }
  });

  it('un reintegro ya proyectado con reserva confirmada sigue requiriendo revisión', async () => {
    const db = new SqliteD1(migration);
    try {
      const item = await order(db, 'refunded');
      await link(db, item.id, 'confirmed'); await pay(db, item.id, 'refunded');
      expect((await listCommerceAttention(db)).rows[0]?.next_action).toBe('release_review');
    } finally { db.close(); }
  });

});
