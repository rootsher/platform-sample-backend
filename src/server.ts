import pg from 'pg';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = buildApp({ pool, logLevel: config.logLevel });

// Kubernetes sends SIGTERM and waits terminationGracePeriodSeconds before
// SIGKILL. The chart delays SIGTERM with a preStop sleep so the pod is out of
// the endpoints first; here we only have to finish what is already in flight.
async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  const timer = setTimeout(() => {
    app.log.error('shutdown timed out');
    process.exit(1);
  }, 20_000);
  timer.unref();

  await app.close();
  await pool.end();
  process.exit(0);
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

await app.listen({ port: config.port, host: config.host });
