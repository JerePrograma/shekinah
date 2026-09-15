import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SqliteD1 } from './test/sqlite-d1';
import { createDuxRequestGate } from './dux-request-gate';

function database(): SqliteD1 {
  return new SqliteD1(readdirSync(resolve('migrations')).filter((name) => /^\d{4}_.*\.sql$/u.test(name)).sort()
    .map((name) => readFileSync(resolve('migrations', name), 'utf8')).join('\n'));
}

it('coordina dos instancias mediante D1 y conserva cinco segundos entre permisos', async () => {
  const db = database();
  let now = 100000;
  const sleep = vi.fn((milliseconds: number) => { now += milliseconds; return Promise.resolve(); });
  try {
    const first = createDuxRequestGate(db, { now: () => now, sleep });
    const second = createDuxRequestGate(db, { now: () => now, sleep });
    await first();
    expect(now).toBe(100000);
    await second();
    expect(now).toBe(106000);
    await first();
    expect(now).toBe(112000);
    expect(sleep.mock.calls).toEqual([[6000], [6000]]);
  } finally { db.close(); }
});

it('falla cerrado si falta la migración o el registro coordinador', async () => {
  const missing = new SqliteD1('');
  const db = database();
  try {
    await expect(createDuxRequestGate(missing)()).rejects.toMatchObject({ code: 'DUX_REQUEST_GATE_UNAVAILABLE' });
    await db.prepare('DELETE FROM dux_api_request_gate').run();
    await expect(createDuxRequestGate(db)()).rejects.toMatchObject({ code: 'DUX_REQUEST_GATE_UNAVAILABLE' });
  } finally { missing.close(); db.close(); }
});

it('no libera un permiso con reloj inválido ni queda esperando indefinidamente', async () => {
  const db = database();
  try {
    await expect(createDuxRequestGate(db, { now: () => NaN })()).rejects.toMatchObject({ code: 'DUX_REQUEST_GATE_UNAVAILABLE' });
    await db.prepare('UPDATE dux_api_request_gate SET next_request_at_ms = 200000').run();
    await expect(createDuxRequestGate(db, { now: () => 0 })()).rejects.toMatchObject({ code: 'DUX_REQUEST_GATE_UNAVAILABLE' });
    const sleep = vi.fn(() => Promise.resolve());
    await expect(createDuxRequestGate(db, { now: () => 199000, sleep })()).rejects.toMatchObject({ code: 'DUX_REQUEST_SLOT_BUSY' });
    expect(sleep).toHaveBeenCalledTimes(1);
  } finally { db.close(); }
});
