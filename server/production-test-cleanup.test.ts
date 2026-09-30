import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const cleanup = readFileSync(resolve('scripts/operations/purge-production-tests-2026-09-30.sql'), 'utf8');
const legacyCleanup = readFileSync(resolve('scripts/operations/purge-owner-and-legacy-tests-2026-09-30.sql'), 'utf8');
const scope = [
  ['req_klYbZQNnzcZBF1NAUWvxdJjN', 'ord_wNdSN3hQXcKHU4SPz1DsRUks', 350000, '799000001', '445638367-33977e51-a400-4956-896a-8f365dea388f', '3417590', '1'],
  ['req_SSxw2QbNUO37Gn-x3C-_5syj', 'ord_QV2DVvj5lWELqOKLBJi0oCuZ', 2190000, '799000516', null, null, null],
  ['req_K6tG1vGCUOSoX8cU7Mp0gBH_', 'ord_l5iXS4a6bPMrSiu9hVOJm-FX', 2190000, '799000516', '445638367-7cd16e9f-393a-45bc-96a0-a4c9a34de3a4', '3422535', '3'],
  ['req_Xcfq-0wMTO23pDEkMWm0WtGq', null, null, null, null, null, null],
  ['req_K7eKP-Nv0Wvfc-ZOj2ucvhwU', null, null, null, null, null, null],
  ['req_Du-P7e_aRpJCO30Dics_bddw', null, null, null, null, null, null],
  ['req_rGOZ82A8RKGmR_wien6g1ZJm', null, null, null, null, null, null],
] as const;
const date = '2026-09-21T05:04:02.908Z';
const otherOrder = 'ord_unrelated_customer_00001';
const otherRequest = 'req_unrelated_customer_00001';

function setup(options: { company?: string; totalOffset?: number; stockControlled?: number; leaseUntil?: number } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(readdirSync(resolve('migrations')).filter(name => /^\d{4}_.*\.sql$/u.test(name)).sort()
    .map(name => readFileSync(resolve('migrations', name), 'utf8')).join('\n'));
  const triggers = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger'").all() as { name: string; sql: string }[];
  // Sembrado sintético de estados históricos: sólo esta preparación retira los
  // triggers. La operación se prueba con todos los guards reales restaurados.
  for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name}"`);
  db.prepare(`INSERT INTO dux_tenant_context VALUES (1,'v2',?,'Fixture','1','Fixture','25566','Fixture',?,?)`)
    .run(options.company ?? '12862', date, date);
  const rows = [...scope.map(row => [...row]), [otherRequest, otherOrder, 10000, 'OTHER', null, null, null]];
  rows.forEach((row, index) => {
    const [requestId, orderId, rawTotal, sku, preferenceId, duxId, duxNumber] = row;
    const key = `fixture-key-${index}`;
    const total = Number(rawTotal) + (index === 0 ? options.totalOffset ?? 0 : 0);
    const review = index === 1;
    const progress = JSON.stringify({ reservationReview: { duxOrderId: 3421572, duxOrderNumber: 2 } });
    db.prepare(`INSERT INTO checkout_intents (checkout_idempotency_key,fulfillment_fingerprint,cart_fingerprint,
      created_at,intent_kind,web_request_id,web_request_token_hash,web_request_owner_hash,web_request_fingerprint,
      web_request_json,web_request_status,web_request_updated_at,direct_checkout_state,direct_checkout_error_code,
      direct_checkout_progress_json,direct_checkout_lease_until_ms)
      VALUES (?, 'fixture', 'fixture', ?, 'web_request', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(key, date, requestId ?? '', String(index).repeat(64), 'b'.repeat(64), 'c'.repeat(64),
        JSON.stringify({ schemaVersion: 1, fulfillment: { fullName: 'Synthetic fixture', phone: '0000000000' } }),
        orderId === null ? 'rejected' : 'accepted', date,
        orderId === null ? null : review ? 'requires_review' : 'prepared',
        review ? 'DIRECT_RESERVATION_UNVERIFIED' : null, review ? progress : null,
        index === 0 ? options.leaseUntil ?? 0 : 0);
    db.prepare(`INSERT INTO admin_audit (id,actor_sub,actor_email,action,target_type,target_id,
      outcome_status,metadata_json,created_at) VALUES (?, 'fixture', 'fixture@example.test', 'read', 'request', ?, 200, '{}', ?)`)
      .run(`audit-${index}`, requestId ?? '', date);
    if (orderId === null) return;
    db.prepare(`INSERT INTO orders (id,public_token_hash,checkout_idempotency_key,cart_fingerprint,status,
      currency,total_minor,item_count,mp_preference_id,mp_checkout_url,mp_preference_attempted_at,
      created_at,updated_at,web_request_id,assisted_checkout_fingerprint)
      VALUES (?, ?, ?, 'fixture', ?, 'ARS', ?, 1, ?, ?, ?, ?, ?, ?, ?)`)
      .run(orderId ?? '', `public-hash-${index}`, key, review ? 'preference_pending' : 'pending', total,
        preferenceId ?? null, preferenceId === null ? null : 'https://provider.example.test/expired',
        preferenceId === null ? null : date, date, date, requestId ?? '', 'd'.repeat(64));
    db.prepare(`INSERT INTO order_items (order_id,product_id,name,sku,quantity,unit_price_minor,subtotal_minor,stock_controlled)
      VALUES (?, ?, 'Synthetic item', ?, 1, ?, ?, ?)`)
      .run(orderId ?? '', `product-${index}`, sku ?? '', total, total, index === 0 ? options.stockControlled ?? 0 : 0);
    db.prepare(`INSERT INTO order_fulfillment (order_id,delivery_method,full_name,phone,address,locality,
      province,postal_code,shipping_tier,products_total_minor,shipping_minor,created_at,updated_at)
      VALUES (?, 'coordinated_pickup', 'Synthetic fixture', '0000000000', '', '', '', '', 'coordinated_pickup', ?, 0, ?, ?)`)
      .run(orderId ?? '', total, date, date);
    db.prepare(`INSERT INTO dux_order_links (order_id,dux_reference,dux_order_id,dux_order_number,company_id,
      branch_id,deposit_id,reservation_state,request_fingerprint,created_at,updated_at,verification_method,released_at)
      VALUES (?, ?, ?, ?, '12862', '1', '25566', ?, 'fixture', ?, ?, 'automatic_api', ?)`)
      .run(orderId ?? '', `shekinah:web:${String(requestId)}`, duxId ?? null, duxNumber ?? null,
        index === 0 || index === 2 ? 'released' : review ? 'pending' : 'confirmed', date, date,
        index === 0 || index === 2 ? date : null);
    db.prepare(`INSERT INTO dux_order_operations (id,idempotency_key,order_id,action,status,request_json,created_at,updated_at)
      VALUES (?, ?, ?, 'reserve', ?, '{}', ?, ?)`)
      .run(`reserve-${index}`, `automatic-reserve:${String(orderId)}`, orderId ?? '', review ? 'pending' : 'confirmed', date, date);
    if (index === 0 || index === 2) db.prepare(`INSERT INTO dux_order_operations
      (id,idempotency_key,order_id,action,status,request_json,created_at,updated_at)
      VALUES (?,? ,?,'release','confirmed','{}',?,?)`).run(`release-${index}`, `release-${index}`, orderId ?? '', date, date);
  });
  for (const trigger of triggers) db.exec(trigger.sql);
  return db;
}

function atomic(db: DatabaseSync, sql = cleanup) {
  db.exec('BEGIN IMMEDIATE');
  try { db.exec(sql); db.exec('COMMIT'); }
  catch (error: unknown) { db.exec('ROLLBACK'); throw error; }
}
function snapshot(db: DatabaseSync) {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name")
    .all() as { name: string }[];
  return Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
}

it('purga sólo las siete solicitudes y tres órdenes, conserva otras compras y restaura el esquema íntegro', () => {
  const db = setup();
  try {
    const schema = db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').all();
    const other = Object.fromEntries(['orders', 'order_items', 'order_fulfillment', 'dux_order_links', 'dux_order_operations']
      .map(table => [table, db.prepare(`SELECT * FROM ${table} WHERE ${table === 'orders' ? 'id' : 'order_id'} = ?`).all(otherOrder)]));
    atomic(db);
    expect(db.prepare('SELECT id FROM orders').all()).toEqual([{ id: otherOrder }]);
    expect(db.prepare('SELECT web_request_id FROM checkout_intents').all()).toEqual([{ web_request_id: otherRequest }]);
    for (const [table, rows] of Object.entries(other)) {
      expect(db.prepare(`SELECT * FROM ${table}`).all()).toEqual(rows);
    }
    expect(db.prepare('SELECT target_id FROM admin_audit').all()).toEqual([{ target_id: otherRequest }]);
    expect(db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').all()).toEqual(schema);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(() => db.exec('DELETE FROM checkout_intents')).toThrow('WEB_REQUEST_HISTORY_REQUIRED');
    expect(() => db.exec('DELETE FROM dux_order_operations')).toThrow('DUX_AUTOMATIC_HISTORY_IMMUTABLE');
    expect(() => atomic(db)).toThrow('CHECK constraint failed');
    expect(db.prepare('SELECT id FROM orders').all()).toEqual([{ id: otherOrder }]);
  } finally { db.close(); }
});

it.each(['approved', 'pending', 'rejected', 'cancelled', 'refunded'])('no borra ninguna evidencia financiera %s', (status) => {
  const db = setup();
  try {
    db.prepare(`INSERT INTO payments (provider_payment_id,order_id,mapped_status,provider_status,amount_minor,
      currency,external_reference,last_event_key,created_at,updated_at) VALUES ('123',?,?,?,350000,'ARS',?,'fixture',?,?)`)
      .run(scope[0][1], status, status, scope[0][1], date, date);
    const before = snapshot(db);
    expect(() => atomic(db)).toThrow('CHECK constraint failed');
    expect(snapshot(db)).toEqual(before);
  } finally { db.close(); }
});

it.each([
  { company: 'different-company' },
  { totalOffset: 1 },
  { stockControlled: 1 },
  { leaseUntil: Date.now() + 3_600_000 },
])('rechaza un tenant, importe, inventario local o ejecución en curso incompatibles: %j', (options) => {
  const db = setup(options);
  try {
    const before = snapshot(db);
    expect(() => atomic(db)).toThrow('CHECK constraint failed');
    expect(snapshot(db)).toEqual(before);
  } finally { db.close(); }
});

it('revierte filas y ambos guards cuando un fallo ocurre después de comenzar el borrado', () => {
  const db = setup();
  try {
    const before = snapshot(db);
    const schema = db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').all();
    const interrupted = cleanup.replace('DELETE FROM dux_order_links WHERE',
      "INSERT INTO production_test_purge_guard_20260930 VALUES ('injected_failure',0);\nDELETE FROM dux_order_links WHERE");
    expect(() => atomic(db, interrupted)).toThrow('CHECK constraint failed');
    expect(snapshot(db)).toEqual(before);
    expect(db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').all()).toEqual(schema);
  } finally { db.close(); }
});

const legacyScope = [
  ['ord_rIMjecGO5jK2OOZdKIDfDOlX', 'whatsapp', 'approved', 150000, 'abedul', 'ABEDUL', '2026-08-12T19:09:45.679Z', null],
  ['ord_9GAeh-ZzHsn5wCoObMAijvFZ', 'checkout_pro', 'pending', 25000, 'aji-panca-salteno-en-vaina', 'AJPANCASAL', '2026-08-13T23:37:20.274Z', '240850958-2f437cd7-9e66-4202-b4d1-f00f827d4cb5'],
  ['ord_krUrLYTgjjdzBL-ccQc3EBp8', 'checkout_pro', 'pending', 25000, 'aji-panca-salteno-en-vaina', 'AJPANCASAL', '2026-08-14T18:49:03.739Z', '240850958-b5c67ff0-8fd5-4f8e-8d7c-545d19f04899'],
  ['ord_Flz23lHXjgcpdx6S6fQnaOAf', 'checkout_pro', 'pending', 25000, 'aji-panca-salteno-en-vaina', 'AJPANCASAL', '2026-08-15T14:27:27.664Z', '240850958-772d6dca-b94f-4ba6-b91c-f5ec1e4de6ec'],
  ['ord_rQ5c3obb0UKwB2bvMnSjs9g-', 'checkout_pro', 'pending', 25000, 'aji-panca-salteno-en-vaina', 'AJPANCASAL', '2026-08-18T15:26:48.420Z', '240850958-9ea7fe0c-215f-4aca-95ce-7971b3cdf955'],
] as const;

function setupLegacy() {
  const db = new DatabaseSync(':memory:');
  db.exec(readdirSync(resolve('migrations')).filter(name => /^\d{4}_.*\.sql$/u.test(name)).sort()
    .map(name => readFileSync(resolve('migrations', name), 'utf8')).join('\n'));
  const triggers = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger'").all() as { name: string; sql: string }[];
  for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name}"`);
  const rows = [...legacyScope, [otherOrder, 'whatsapp', 'approved', 10000, 'unrelated', 'OTHER', date, null] as const];
  rows.forEach(([id, channel, status, total, product, sku, created, preference], index) => {
    const key = `legacy-fixture-${index}`;
    db.prepare(`INSERT INTO orders (id,public_token_hash,checkout_idempotency_key,cart_fingerprint,status,currency,
      total_minor,item_count,channel,mp_preference_id,mp_checkout_url,mp_preference_attempted_at,
      created_at,updated_at,approved_at,resolved_at,resolved_by)
      VALUES (?,?,?,'fixture',?,'ARS',?,1,?,?,?,?,?,?,?,?,?)`)
      .run(id, `legacy-public-${index}`, key, status, total, channel, preference,
        preference === null ? null : 'https://provider.example.test/expired', preference === null ? null : created,
        created, created, status === 'approved' ? created : null, status === 'approved' ? created : null,
        status === 'approved' ? 'admin:fixture' : null);
    db.prepare(`INSERT INTO order_items (order_id,product_id,name,sku,quantity,unit_price_minor,subtotal_minor,stock_controlled)
      VALUES (?,?,'Synthetic item',?,1,?,?,0)`).run(id, product, sku, total, total);
    db.prepare(`INSERT INTO order_fulfillment (order_id,delivery_method,full_name,phone,address,locality,province,postal_code,
      shipping_tier,products_total_minor,shipping_minor,created_at,updated_at)
      VALUES (?,'coordinated_pickup','Synthetic fixture','0000000000','','','','','coordinated_pickup',?,0,?,?)`)
      .run(id, total, created, created);
    if (channel === 'checkout_pro') db.prepare(`INSERT INTO checkout_intents
      (checkout_idempotency_key,fulfillment_fingerprint,cart_fingerprint,created_at) VALUES (?,'fixture','fixture',?)`).run(key, created);
    db.prepare(`INSERT INTO admin_audit (id,actor_sub,actor_email,action,target_id,outcome_status,metadata_json,created_at)
      VALUES (?,'fixture','fixture@example.test','read',?,200,'{}',?)`).run(`legacy-audit-${index}`, id, created);
  });
  for (const trigger of triggers) db.exec(trigger.sql);
  return db;
}

it('elimina las cinco pruebas legacy y sus contactos por FK sin retirar triggers ni cambiar otra compra', () => {
  const db = setupLegacy();
  try {
    const schema = db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').all();
    const preserved = db.prepare('SELECT * FROM orders WHERE id=?').all(otherOrder);
    expect(() => db.prepare('DELETE FROM order_items WHERE order_id=?').run(legacyScope[0][0]))
      .toThrow('WHATSAPP_ORDER_ITEMS_IMMUTABLE');
    atomic(db, legacyCleanup);
    expect(db.prepare('SELECT * FROM orders').all()).toEqual(preserved);
    expect(db.prepare('SELECT order_id FROM order_items').all()).toEqual([{ order_id: otherOrder }]);
    expect(db.prepare('SELECT order_id FROM order_fulfillment').all()).toEqual([{ order_id: otherOrder }]);
    expect(db.prepare('SELECT target_id FROM admin_audit').all()).toEqual([{ target_id: otherOrder }]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM checkout_intents').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').all()).toEqual(schema);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(() => atomic(db, legacyCleanup)).toThrow('CHECK constraint failed');
  } finally { db.close(); }
});

it('conserva cualquier pago legacy y revierte una purga interrumpida después de borrar órdenes', () => {
  const db = setupLegacy();
  try {
    const before = snapshot(db);
    const interrupted = legacyCleanup.replace('DELETE FROM admin_audit WHERE',
      "INSERT INTO owner_legacy_purge_guard_20260930 VALUES ('injected_failure',0);\nDELETE FROM admin_audit WHERE");
    expect(() => atomic(db, interrupted)).toThrow('CHECK constraint failed');
    expect(snapshot(db)).toEqual(before);
    db.prepare(`INSERT INTO payments (provider_payment_id,order_id,mapped_status,provider_status,amount_minor,currency,
      external_reference,last_event_key,created_at,updated_at) VALUES ('456',?,'approved','approved',25000,'ARS',?,'fixture',?,?)`)
      .run(legacyScope[1][0], legacyScope[1][0], date, date);
    const withPayment = snapshot(db);
    expect(() => atomic(db, legacyCleanup)).toThrow('CHECK constraint failed');
    expect(snapshot(db)).toEqual(withPayment);
  } finally { db.close(); }
});
