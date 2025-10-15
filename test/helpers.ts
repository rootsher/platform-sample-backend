import pg from 'pg';
import { runner } from 'node-pg-migrate';

export const databaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/app_test';

export function migrate(direction: 'up' | 'down', count = Infinity) {
  return runner({
    databaseUrl,
    dir: 'migrations',
    direction,
    count,
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
}

export function createPool() {
  return new pg.Pool({ connectionString: databaseUrl });
}
