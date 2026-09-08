import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import type { D1Database, D1PreparedStatement, D1Result, D1Value } from './platform';
import { createWebOrderRequest, parseWebRequestInput, resolveWebOrderRequest } from './web-order-requests';

// Cada worker tiene su propia conexión SQLite al mismo archivo. Los handlers
// reales se ejecutan con adaptadores que despachan SQL, no con respuestas simuladas.
const workerCode = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(workerData.path);
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
const execute = ({ sql, values = [], kind, column }) => {
  const statement = db.prepare(sql);
  if (kind === 'first') {
    const row = statement.get(...values);
    return row === undefined ? null : column === undefined ? row : row[column] ?? null;
  }
  if (kind === 'all') return { success: true, results: statement.all(...values), meta: {} };
  const result = statement.run(...values);
  return { success: true, results: [], meta: { changes: Number(result.changes) } };
};
parentPort.on('message', ({ id, query, batch }) => {
  try {
    let value;
    if (batch) {
      db.exec('BEGIN IMMEDIATE');
      try { value = batch.map(execute); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    } else value = execute(query);
    parentPort.postMessage({ id, value });
  } catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
parentPort.postMessage({ ready: true });
`;

type Query = Readonly<{ sql: string; values: readonly D1Value[]; kind: 'first' | 'run' | 'all'; column?: string }>;
class Connection implements D1Database {
  readonly worker: Worker;
  readonly ready: Promise<void>;
  private next = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  constructor(path: string) {
    this.worker = new Worker(workerCode, { eval: true, workerData: { path } });
    this.worker.on('error', (error: unknown) => {
      const failure = error instanceof Error ? error : new Error('El worker de prueba falló.');
      for (const waiter of this.pending.values()) waiter.reject(failure);
      this.pending.clear();
    });
    this.ready = new Promise((resolve, reject) => {
      this.worker.once('error', reject);
      this.worker.on('message', (message: { ready?: boolean; id: number; value: unknown; error?: string }) => {
        if (message.ready) { resolve(); return; }
        const waiter = this.pending.get(message.id); this.pending.delete(message.id);
        if (message.error !== undefined) waiter?.reject(new Error(message.error)); else waiter?.resolve(message.value);
      });
    });
  }
  async dispatch<T>(payload: { query?: Query; batch?: readonly Query[] }): Promise<T> {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = this.next++; this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      this.worker.postMessage({ id, ...payload });
    });
  }
  prepare(sql: string): D1PreparedStatement { return new Statement(this, sql, []); }
  batch<T>(statements: readonly D1PreparedStatement[]): Promise<readonly D1Result<T>[]> {
    const batch = statements.map((statement) => {
      if (!(statement instanceof Statement)) throw new Error('Statement ajeno a esta conexión.');
      return statement.query('run');
    });
    return this.dispatch({ batch });
  }
  exec(): Promise<Readonly<{ count: number; duration: number }>> { throw new Error('Exec no forma parte del flujo de solicitudes.'); }
}
class Statement implements D1PreparedStatement {
  constructor(private connection: Connection, private sql: string, private values: readonly D1Value[]) {}
  bind(...values: readonly D1Value[]): D1PreparedStatement { return new Statement(this.connection, this.sql, values); }
  query(kind: Query['kind'], column?: string): Query { return { sql: this.sql, values: this.values, kind, ...(column === undefined ? {} : { column }) }; }
  first<T>(column?: string): Promise<T | null> { return this.connection.dispatch({ query: this.query('first', column) }); }
  all<T>(): Promise<D1Result<T>> { return this.connection.dispatch({ query: this.query('all') }); }
  run<T>(): Promise<D1Result<T>> { return this.connection.dispatch({ query: this.query('run') }); }
  raw<T>(): Promise<readonly T[]> { throw new Error('Raw no forma parte del flujo de solicitudes.'); }
}

it('ocho conexiones concurrentes conservan una solicitud, una cuota y una resolución comercial', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'shekinah-request-'));
  const path = join(directory, 'requests.sqlite');
  const db = new DatabaseSync(path);
  const connections: Connection[] = [];
  try {
    const names = ['0001_commerce.sql', '0002_fulfillment_and_retention.sql', '0003_checkout_intent_cart_fingerprint.sql',
      '0012_dux_authoritative_inventory.sql', '0020_web_order_requests.sql'];
    db.exec(names.map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8')).join('\n'));
    db.exec('PRAGMA journal_mode=WAL;');
    for (let index = 0; index < 8; index += 1) connections.push(new Connection(path));
    await Promise.all(connections.map((connection) => connection.ready));
    const version = 'a'.repeat(64); const now = new Date('2026-09-08T12:00:00.000Z');
    const input = parseWebRequestInput({ mode: 'create', idempotencyKey: crypto.randomUUID(), ownerSecret: 'c'.repeat(64),
      items: [{ productId: 'dux-test-a', quantity: 1, catalogVersion: version }],
      fulfillment: { method: 'coordinated_pickup', fullName: 'Cliente sintético', phone: '1234567890' } });
    const results = await Promise.all(connections.map((connection) => createWebOrderRequest(connection, input, 's'.repeat(40),
      () => Promise.resolve({ catalogVersion: version, syncedAt: now.toISOString(), items: [{
        slug: 'dux-test-a', code: 'TEST-A', name: 'Producto sintético', priceAmount: 10, priceStatus: 'usable',
        categories: [], unitsPerPackage: null, imageUrl: null, description: null,
      }] }), [{ key: 'same-global-budget', limit: 1 }], now)));
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(new Set(results.map((result) => result.receipt.publicToken)).size, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM checkout_intents').get()?.count, 1);
    assert.equal(db.prepare('SELECT request_count FROM commerce_request_rate_limits').get()?.request_count, 1);
    const id = db.prepare('SELECT web_request_id AS id FROM checkout_intents').get()?.id;
    assert.equal(typeof id, 'string');
    const resolutions = await Promise.allSettled(connections.map((connection, index) =>
      resolveWebOrderRequest(connection, String(id), index % 2 === 0 ? 'accepted' : 'rejected', 'test:admin')));
    const success = resolutions.filter((result) => result.status === 'fulfilled');
    assert.equal(success.filter((result) => result.status === 'fulfilled' && result.value.changed).length, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM payments').get()?.count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM dux_order_operations').get()?.count, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    await Promise.all(connections.map((connection) => connection.worker.terminate()));
    db.close(); rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);
