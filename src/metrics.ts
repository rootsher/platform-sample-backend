import type { FastifyInstance } from 'fastify';
import client from '@prometheus-io/client';

export function metrics(app: FastifyInstance) {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });

  const duration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration by route and status',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
  });

  app.addHook('onResponse', async (req, reply) => {
    // The route template, not the raw URL, so /notes/1 and /notes/2 share
    // one series. Unmatched requests are grouped instead of exploding labels.
    const route = req.routeOptions.url ?? 'unmatched';
    if (route === '/metrics') return;
    duration.observe(
      { method: req.method, route, status_code: reply.statusCode },
      reply.elapsedTime / 1000,
    );
  });

  app.get('/metrics', { logLevel: 'warn' }, async (_req, reply) => {
    reply.type(registry.contentType);
    return registry.metrics();
  });
}
