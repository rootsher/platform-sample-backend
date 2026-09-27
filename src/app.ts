import Fastify, { type FastifyError } from 'fastify';
import type pg from 'pg';
import { metrics } from './metrics.ts';
import { notesRoutes } from './routes/notes.ts';

export interface AppOptions {
  pool: pg.Pool;
  logLevel?: string;
}

export function buildApp({ pool, logLevel = 'info' }: AppOptions) {
  const app = Fastify({ logger: { level: logLevel } });

  metrics(app);

  // Fastify returns the error message by default, which for a failed query
  // means Postgres internals in the response body. Client errors keep theirs.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status < 500) return reply.send(err);
    req.log.error({ err }, 'request failed');
    return reply.code(status).send({ error: 'internal error' });
  });

  // Liveness only says the process is alive. It must not touch the database,
  // otherwise a short Postgres outage restarts every pod at once.
  app.get('/healthz', { logLevel: 'warn' }, () => ({ status: 'ok' }));

  app.get('/readyz', { logLevel: 'warn' }, async (_req, reply) => {
    try {
      await pool.query('select 1');
      return { status: 'ok' };
    } catch (err) {
      app.log.warn({ err }, 'database not reachable');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  app.register(notesRoutes(pool), { prefix: '/api' });

  return app;
}
