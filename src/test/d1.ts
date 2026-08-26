import { DatabaseSync } from 'node:sqlite';

import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1Value,
} from '../../server/platform';

export type TestD1 = Readonly<{
  database: D1Database;
  sqlite: DatabaseSync;
  close: () => void;
}>;

export function createTestD1(...migrations: readonly string[]): TestD1 {
  const sqlite = new DatabaseSync(':memory:');
  migrations.forEach((migration) => sqlite.exec(migration));
  const database: D1Database = {
    prepare: (query) => new TestPreparedStatement(sqlite, query),
    batch: async <T>(statements: readonly D1PreparedStatement[]) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) {
          results.push(await statement.run<T>());
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (error: unknown) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    exec: (query) => {
      sqlite.exec(query);
      return Promise.resolve({ count: 1, duration: 0 });
    },
  };
  return Object.freeze({
    database,
    sqlite,
    close: () => sqlite.close(),
  });
}

class TestPreparedStatement implements D1PreparedStatement {
  readonly #database: DatabaseSync;
  readonly #query: string;
  readonly #values: readonly D1Value[];

  constructor(
    database: DatabaseSync,
    query: string,
    values: readonly D1Value[] = [],
  ) {
    this.#database = database;
    this.#query = query;
    this.#values = values;
  }

  bind(...values: readonly D1Value[]): D1PreparedStatement {
    return new TestPreparedStatement(this.#database, this.#query, values);
  }

  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const row = this.#database.prepare(this.#query).get(...this.#sqlValues());
    if (row === undefined) return Promise.resolve(null);
    if (columnName !== undefined) {
      return Promise.resolve((row as Record<string, unknown>)[columnName] as T);
    }
    return Promise.resolve(row as T);
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const rows = this.#database.prepare(this.#query).all(...this.#sqlValues());
    return Promise.resolve({
      success: true,
      meta: { changes: 0, rows_read: rows.length, rows_written: 0 },
      results: rows as unknown as readonly T[],
    });
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = this.#database.prepare(this.#query).run(...this.#sqlValues());
    const changes = Number(result.changes);
    return Promise.resolve({
      success: true,
      meta: { changes, rows_read: 0, rows_written: changes },
      results: [],
    });
  }

  raw<T = unknown[]>(): Promise<readonly T[]> {
    const rows = this.#database.prepare(this.#query).all(...this.#sqlValues());
    return Promise.resolve(
      rows.map((row) => Object.values(row) as T),
    );
  }

  #sqlValues(): Array<string | number | bigint | null | Uint8Array> {
    return this.#values.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    );
  }
}
