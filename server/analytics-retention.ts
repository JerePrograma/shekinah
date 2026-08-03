import type { D1Database } from './platform';

const DAY_MS = 24 * 60 * 60 * 1000;

export type AnalyticsPurgeResult = Readonly<{
  executed: boolean;
  eventsDeleted: number;
  sessionsDeleted: number;
  revocationsDeleted: number;
}>;

export async function purgeAnalyticsIfDue(
  database: D1Database,
  retentionDays: number,
  now = new Date(),
): Promise<AnalyticsPurgeResult> {
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 730) {
    throw new RangeError('La retención analítica debe estar entre 1 y 730 días.');
  }
  if (Number.isNaN(now.getTime())) throw new RangeError('La fecha de purga no es válida.');

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const claim = await database
    .prepare(
      `INSERT INTO analytics_maintenance (task_name, last_run_at)
       VALUES ('retention', ?)
       ON CONFLICT(task_name) DO UPDATE SET last_run_at = excluded.last_run_at
       WHERE analytics_maintenance.last_run_at < ?`,
    )
    .bind(now.toISOString(), monthStart.toISOString())
    .run();
  if ((claim.meta.changes ?? 0) !== 1) {
    return Object.freeze({
      executed: false,
      eventsDeleted: 0,
      sessionsDeleted: 0,
      revocationsDeleted: 0,
    });
  }

  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS).toISOString();
  try {
    const results = await database.batch([
      database.prepare('DELETE FROM analytics_events WHERE created_at < ?').bind(cutoff),
      database
        .prepare(
          `DELETE FROM analytics_sessions
           WHERE updated_at < ?
             AND NOT EXISTS (
               SELECT 1 FROM analytics_events
               WHERE analytics_events.session_hash = analytics_sessions.session_hash
             )`,
        )
        .bind(cutoff),
      database.prepare('DELETE FROM analytics_revocations WHERE revoked_at < ?').bind(cutoff),
    ]);

    return Object.freeze({
      executed: true,
      eventsDeleted: results[0]?.meta.changes ?? 0,
      sessionsDeleted: results[1]?.meta.changes ?? 0,
      revocationsDeleted: results[2]?.meta.changes ?? 0,
    });
  } catch (error: unknown) {
    await database
      .prepare(
        `UPDATE analytics_maintenance
         SET last_run_at = '1970-01-01T00:00:00.000Z'
         WHERE task_name = 'retention' AND last_run_at = ?`,
      )
      .bind(now.toISOString())
      .run();
    throw error;
  }
}
