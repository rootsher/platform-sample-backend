// Loaded with --import before anything else, because instrumentation has to
// patch http, pg and fastify before the app imports them. Configuration comes
// from the standard OTEL_* variables, so where traces go is decided by the
// platform, not by the code.
import { FastifyOtelInstrumentation } from '@fastify/otel';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { NodeSDK } from '@opentelemetry/sdk-node';

// Probes and scrapes would be most of the traces and none of the value.
const untraced = new Set(['/healthz', '/readyz', '/metrics']);
const path = (url = '') => url.split('?', 1)[0] ?? '';

// Without an endpoint there is nowhere to send spans: tests and local runs
// start without the SDK instead of logging export failures.
const sdk = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? new NodeSDK({
      instrumentations: [
        // Both layers have to skip them: with no HTTP span, the Fastify
        // instrumentation would start a root span of its own.
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (req) => untraced.has(path(req.url)),
        }),
        new FastifyOtelInstrumentation({
          registerOnInitialization: true,
          ignorePaths: ({ url }) => untraced.has(path(url)),
        }),
        // Queries only as part of a request; the readiness check's select 1
        // has no parent and is dropped.
        new PgInstrumentation({ requireParentSpan: true }),
      ],
    })
  : undefined;

sdk?.start();

// Called by server.ts during shutdown, after the app and the pool are closed,
// so the spans of the last requests are flushed before the process exits.
export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
