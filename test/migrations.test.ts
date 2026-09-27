import { afterAll, describe, expect, it } from 'vitest';
import { createPool, migrate } from './helpers.ts';

const pool = createPool();

afterAll(() => pool.end());

// Everything a down migration could forget to remove: columns with their
// nullability and defaults, constraints, indexes, sequences, types and
// functions. The migration bookkeeping table itself is left out.
async function schema() {
  const query = async (sql: string) => (await pool.query<Record<string, unknown>>(sql)).rows;
  return {
    columns: await query(`
      select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name <> 'pgmigrations'
      order by table_name, column_name`),
    constraints: await query(`
      select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as definition
      from pg_constraint
      where connamespace = 'public'::regnamespace and conrelid <> 'public.pgmigrations'::regclass
      order by table_name, conname`),
    indexes: await query(`
      select tablename, indexname, indexdef
      from pg_indexes
      where schemaname = 'public' and tablename <> 'pgmigrations'
      order by tablename, indexname`),
    sequences: await query(`
      select sequence_name from information_schema.sequences
      where sequence_schema = 'public' and sequence_name <> 'pgmigrations_id_seq'
      order by sequence_name`),
    types: await query(`
      select t.typname from pg_type t
      where t.typnamespace = 'public'::regnamespace and t.typtype in ('e', 'd', 'r')
      order by t.typname`),
    functions: await query(`
      select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
      order by p.proname, args`),
  };
}

// Rolling a release back may mean running its down migration, so every down
// has to bring the schema back to exactly what it was before the up.
describe('migrations', () => {
  it('reverse cleanly one step at a time', async () => {
    await migrate('down');
    const snapshots = [await schema()];

    let applied = await migrate('up', 1);
    while (applied.length > 0) {
      snapshots.push(await schema());
      applied = await migrate('up', 1);
    }

    for (let i = snapshots.length - 1; i > 0; i--) {
      await migrate('down', 1);
      expect(await schema()).toEqual(snapshots[i - 1]);
    }

    await migrate('up');
  });
});
