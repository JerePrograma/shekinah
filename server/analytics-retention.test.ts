import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { purgeAnalyticsIfDue } from './analytics-retention';
import { readAnalyticsRetentionDays } from './config';
import { SqliteD1 } from './test/sqlite-d1';

const migration = ['0001_commerce.sql', '0002_fulfillment_and_retention.sql']
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'))
  .join('\n');

describe('retención analítica', () => {
  it('purga sólo valores anteriores al corte exacto de 730 días', async () => {
    const database = new SqliteD1(migration);
    try {
      const now = new Date('2026-08-03T12:00:00.000Z');
      const cutoff = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1_000);
      const older = new Date(cutoff.getTime() - 1).toISOString();
      const exact = cutoff.toISOString();
      for (const [id, timestamp] of [['old', older], ['exact', exact]] as const) {
        await database.prepare('INSERT INTO analytics_sessions VALUES (?, ?, ?, ?)').bind(id, '1', timestamp, timestamp).run();
        await database.prepare('INSERT INTO analytics_events VALUES (?, ?, ?, ?, NULL, ?, ?, ?)')
          .bind(`event-${id}`, id, 'page_view', '/', 'direct', 'desktop', timestamp).run();
        await database.prepare('INSERT INTO analytics_revocations VALUES (?, ?)').bind(`revoked-${id}`, timestamp).run();
      }

      await expect(purgeAnalyticsIfDue(database, 730, now)).resolves.toMatchObject({
        executed: true, eventsDeleted: 1, sessionsDeleted: 1, revocationsDeleted: 1,
      });
      await expect(database.prepare('SELECT id FROM analytics_events ORDER BY id').all())
        .resolves.toMatchObject({ results: [{ id: 'event-exact' }] });
      await expect(database.prepare('SELECT session_hash FROM analytics_sessions ORDER BY session_hash').all())
        .resolves.toMatchObject({ results: [{ session_hash: 'exact' }] });
    } finally {
      database.close();
    }
  });

  it('acepta la política permitida y rechaza configuración fuera de rango', async () => {
    expect(readAnalyticsRetentionDays({})).toBeNull();
    expect(readAnalyticsRetentionDays({ ANALYTICS_RETENTION_DAYS: '' })).toBeNull();
    for (const days of ['1', '729', '730']) {
      expect(readAnalyticsRetentionDays({ ANALYTICS_RETENTION_DAYS: days })).toBe(Number(days));
    }
    for (const days of ['0', '-1', '731', 'texto']) {
      expect(() => readAnalyticsRetentionDays({ ANALYTICS_RETENTION_DAYS: days }))
        .toThrowError(expect.objectContaining({ code: 'ANALYTICS_RETENTION_INVALID' }));
    }

    const database = new SqliteD1(migration);
    try {
      for (const days of [0, -1, 731, 1.5]) {
        await expect(purgeAnalyticsIfDue(database, days)).rejects.toBeInstanceOf(RangeError);
      }
    } finally {
      database.close();
    }
  });

  it('admite un solo reclamo concurrente por mes y vuelve a ejecutar al cambiar el mes', async () => {
    const database = new SqliteD1(migration);
    try {
      const now = new Date('2026-08-03T12:00:00.000Z');
      const results = await Promise.all([
        purgeAnalyticsIfDue(database, 730, now),
        purgeAnalyticsIfDue(database, 730, now),
      ]);
      expect(results.map(({ executed }) => executed).sort()).toEqual([false, true]);
      await expect(purgeAnalyticsIfDue(database, 730, new Date('2026-08-31T23:59:59.000Z')))
        .resolves.toMatchObject({ executed: false });
      await expect(purgeAnalyticsIfDue(database, 730, new Date('2026-09-01T00:00:00.000Z')))
        .resolves.toMatchObject({ executed: true });
    } finally {
      database.close();
    }
  });

  it('libera el reclamo mensual si la purga falla', async () => {
    const database = new SqliteD1(`CREATE TABLE analytics_maintenance (
      task_name TEXT PRIMARY KEY,
      last_run_at TEXT NOT NULL
    );`);
    try {
      await expect(purgeAnalyticsIfDue(database, 730, new Date('2026-08-03T12:00:00.000Z')))
        .rejects.toThrow();
      await expect(database.prepare("SELECT last_run_at FROM analytics_maintenance WHERE task_name = 'retention'").first())
        .resolves.toEqual({ last_run_at: '1970-01-01T00:00:00.000Z' });
    } finally {
      database.close();
    }
  });
});
