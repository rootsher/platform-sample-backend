// Loaded with --import before anything else, because instrumentation has to
// patch http, pg and fastify before the app imports them. Configuration comes
// from the standard OTEL_* variables, so where traces go is decided by the
// platform, not by the code.
import { FastifyOtelInstrumentation } from '@fastify/otel';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { NodeSDK } from '@opentelemetry/sdk-node';

// Without an endpoint there is nowhere to send spans: tests and local runs
// start without the SDK instead of logging export failures.
const sdk = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? new NodeSDK({
      instrumentations: [
        new HttpInstrumentation({
          // Probes and scrapes would be most of the traces and none of the value.
          ignoreIncomingRequestHook: (req) =>
            ['/healthz', '/readyz', '/metrics'].includes(req.url ?? ''),
        }),
        new PgInstrumentation(),
        new FastifyOtelInstrumentation({ registerOnInitialization: true }),
      ],
    })
  : undefined;

sdk?.start();

// Called by server.ts during shutdown, after the app and the pool are closed,
// so the spans of the last requests are flushed before the process exits.
export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
