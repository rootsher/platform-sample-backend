import type { FastifyPluginCallback } from 'fastify';
import type pg from 'pg';

interface Note {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

const note = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    body: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
} as const;

export function notesRoutes(pool: pg.Pool): FastifyPluginCallback {
  return (app, _opts, done) => {
    app.get<{ Querystring: { limit: number } }>(
      '/notes',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          },
          response: { 200: { type: 'array', items: note } },
        },
      },
      async (req) => {
        const { rows } = await pool.query<Note>(
          'select id, title, body, created_at from notes order by id desc limit $1',
          [req.query.limit],
        );
        return rows;
      },
    );

    app.get<{ Params: { id: string } }>(
      '/notes/:id',
      {
        schema: {
          params: { type: 'object', properties: { id: {
                type: 'string',
                pattern: '^[0-9]+$',
                // Longer ids overflow bigint, which Postgres reports as an error:
                // a 500 anyone could produce, spending the availability budget.
                maxLength: 18,
              }, } },
          response: { 200: note },
        },
      },
      async (req, reply) => {
        const { rows } = await pool.query<Note>(
          'select id, title, body, created_at from notes where id = $1',
          [req.params.id],
        );
        if (rows.length === 0) return reply.code(404).send({ error: 'not found' });
        return rows[0];
      },
    );

    app.post<{ Body: { title: string; body?: string } }>(
      '/notes',
      {
        schema: {
          body: {
            type: 'object',
            required: ['title'],
            additionalProperties: false,
            properties: {
              title: { type: 'string', minLength: 1, maxLength: 200 },
              body: { type: 'string', maxLength: 10000 },
            },
          },
          response: { 201: note },
        },
      },
      async (req, reply) => {
        const { rows } = await pool.query<Note>(
          'insert into notes (title, body) values ($1, $2) returning id, title, body, created_at',
          [req.body.title, req.body.body ?? ''],
        );
        return reply.code(201).send(rows[0]);
      },
    );

    done();
  };
}
