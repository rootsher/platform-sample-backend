import pg from 'pg';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { shutdownTelemetry } from './telemetry.ts';

const config = loadConfig();
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Without a limit, /readyz and every request hang while the database is
  // unreachable, instead of failing fast and letting the pod go unready.
  connectionTimeoutMillis: 2_000,
});
const app = buildApp({
  pool,
  logLevel: config.logLevel,
  faultErrorRate: config.faultErrorRate,
});

// An idle client whose connection drops (a Postgres restart, a CloudNativePG
// failover) is reported here. Without a listener the event is thrown and the
// process dies, which is exactly the restart the liveness probe avoids.
pool.on('error', (err) => {
  app.log.warn({ err }, 'idle database client failed');
});

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
  await shutdownTelemetry();
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

await app.listen({ port: config.port, host: config.host });
