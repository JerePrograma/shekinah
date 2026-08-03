import { DatabaseSync, type StatementSync } from 'node:sqlite';

import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1Value,
} from '../platform';

type BoundStatement = Readonly<{ statement: StatementSync; values: readonly D1Value[] }>;

export class SqliteD1 implements D1Database {
  readonly database = new DatabaseSync(':memory:');

  constructor(migration: string) {
    this.database.exec(migration);
  }

  close(): void {
    this.database.close();
  }

  prepare(query: string): D1PreparedStatement {
    return new SqlitePrepared(this.database.prepare(query));
  }

  batch<T = Record<string, unknown>>(
    statements: readonly D1PreparedStatement[],
  ): Promise<readonly D1Result<T>[]> {
    return Promise.resolve().then(() => {
      this.database.exec('BEGIN IMMEDIATE');
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) {
          if (!(statement instanceof SqlitePrepared)) {
            throw new TypeError('Statement de prueba inválido.');
          }
          results.push(statement.execute<T>());
        }
        this.database.exec('COMMIT');
        return results;
      } catch (error: unknown) {
        this.database.exec('ROLLBACK');
        throw error;
      }
    });
  }

  exec(query: string): Promise<Readonly<{ count: number; duration: number }>> {
    return Promise.resolve().then(() => {
      this.database.exec(query);
      return Object.freeze({ count: 0, duration: 0 });
    });
  }
}

class SqlitePrepared implements D1PreparedStatement {
  private readonly bound: BoundStatement;

  constructor(statement: StatementSync, values: readonly D1Value[] = []) {
    this.bound = Object.freeze({ statement, values });
  }

  bind(...values: readonly D1Value[]): D1PreparedStatement {
    return new SqlitePrepared(this.bound.statement, values);
  }

  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    return Promise.resolve().then(() => {
      const row = this.bound.statement.get(...normalize(this.bound.values)) as
        | Record<string, unknown>
        | undefined;
      if (row === undefined) return null;
      if (columnName !== undefined) return (row[columnName] ?? null) as T | null;
      return row as T;
    });
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve().then(() => {
      const rows = this.bound.statement.all(...normalize(this.bound.values)) as T[];
      return Object.freeze({
        success: true,
        results: Object.freeze(rows),
        meta: Object.freeze({}),
      });
    });
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve().then(() => this.execute<T>());
  }

  raw<T = unknown[]>(
    options?: Readonly<{ columnNames?: boolean }>,
  ): Promise<readonly T[]> {
    return Promise.resolve().then(() => {
      const rows = this.bound.statement.all(
        ...normalize(this.bound.values),
      ) as Record<string, unknown>[];
      const values = rows.map((row) => Object.values(row) as T);
      if (options?.columnNames === true && rows[0] !== undefined) {
        return [Object.keys(rows[0]) as unknown as T, ...values];
      }
      return values;
    });
  }

  execute<T>(): D1Result<T> {
    if (this.bound.statement.columns().length > 0) {
      const rows = this.bound.statement.all(...normalize(this.bound.values)) as T[];
      return Object.freeze({ success: true, results: Object.freeze(rows), meta: Object.freeze({}) });
    }
    const result = this.bound.statement.run(...normalize(this.bound.values));
    return Object.freeze({
      success: true,
      results: Object.freeze([]),
      meta: Object.freeze({
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      }),
    });
  }
}

function normalize(
  values: readonly D1Value[],
): readonly (string | number | bigint | Uint8Array | null)[] {
  return values.map((value) => {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return value;
  });
}
