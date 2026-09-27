import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { createPool, migrate } from './helpers.ts';

interface Note {
  id: string;
  title: string;
  body: string;
}

const pool = createPool();
const app = buildApp({ pool, logLevel: 'silent' });

beforeAll(async () => {
  await migrate('up');
  await app.ready();
});

beforeEach(async () => {
  await pool.query('truncate notes restart identity');
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('health', () => {
  it('reports ready when the database answers', async () => {
    const res = await app.inject('/readyz');
    expect(res.statusCode).toBe(200);
  });
});

describe('notes', () => {
  it('creates a note and reads it back', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { title: 'first', body: 'hello' },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<Note>();

    const read = await app.inject(`/api/notes/${id}`);
    expect(read.statusCode).toBe(200);
    expect(read.json<Note>()).toMatchObject({ id, title: 'first', body: 'hello' });
  });

  it('lists newest first', async () => {
    for (const title of ['a', 'b', 'c']) {
      await app.inject({ method: 'POST', url: '/api/notes', payload: { title } });
    }
    const res = await app.inject('/api/notes?limit=2');
    expect(res.json<Note[]>().map((n) => n.title)).toEqual(['c', 'b']);
  });

  it('rejects an empty title', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/notes', payload: { title: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for a missing note', async () => {
    const res = await app.inject('/api/notes/12345');
    expect(res.statusCode).toBe(404);
  });
});

describe('metrics', () => {
  it('records requests by route template', async () => {
    await app.inject('/api/notes/1');
    const res = await app.inject('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('route="/api/notes/:id"');
  });
});

describe('errors', () => {
  it('rejects ids that would overflow bigint instead of failing with a 500', async () => {
    const res = await app.inject('/api/notes/99999999999999999999');
    expect(res.statusCode).toBe(400);
  });


  it('does not leak database errors to the client', async () => {
    await pool.query('alter table notes rename to notes_hidden');
    try {
      const res = await app.inject('/api/notes');
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'internal error' });
    } finally {
      await pool.query('alter table notes_hidden rename to notes');
    }
  });
});
