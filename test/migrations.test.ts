import { afterAll, describe, expect, it } from 'vitest';
import { createPool, migrate } from './helpers.ts';

const pool = createPool();

afterAll(() => pool.end());

async function schema() {
  const { rows } = await pool.query(`
    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name <> 'pgmigrations'
    order by table_name, column_name`);
  return rows;
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
