import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { purgeAnalyticsIfDue } from './analytics-retention';
import { SqliteD1 } from './test/sqlite-d1';

const migration = ['0001_commerce.sql', '0002_fulfillment_and_retention.sql']
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'))
  .join('\n');

describe('retención analítica', () => {
  it('purga una sola vez por mes y respeta 730 días', async () => {
    const database = new SqliteD1(migration);
    try {
      await database.prepare("INSERT INTO analytics_sessions VALUES ('old', '1', ?, ?)").bind('2024-07-01T00:00:00.000Z', '2024-07-01T00:00:00.000Z').run();
      await database.prepare("INSERT INTO analytics_events VALUES ('event-old', 'old', 'page_view', '/', NULL, 'direct', 'desktop', ?)").bind('2024-07-01T00:00:00.000Z').run();
      await database.prepare("INSERT INTO analytics_revocations VALUES ('revoked-old', ?)").bind('2024-07-01T00:00:00.000Z').run();
      const now = new Date('2026-08-03T12:00:00.000Z');
      const first = await purgeAnalyticsIfDue(database, 730, now);
      expect(first).toMatchObject({ executed: true, eventsDeleted: 1, sessionsDeleted: 1, revocationsDeleted: 1 });
      await expect(purgeAnalyticsIfDue(database, 730, now)).resolves.toMatchObject({ executed: false });
      await expect(purgeAnalyticsIfDue(database, 0, now)).rejects.toBeInstanceOf(RangeError);
    } finally {
      database.close();
    }
  });
});
