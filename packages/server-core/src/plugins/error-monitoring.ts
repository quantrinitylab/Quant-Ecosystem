import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCapture, SentryTransport } from '@quant/error-monitoring';
import type { ErrorEvent, ErrorSeverity } from '@quant/error-monitoring';

// Cross-cutting error-monitoring substrate (Category A). Wired ONCE in
// `createApp()` in the Stage 1 cross-cutting block, so every app inherits
// `fastify.errorMonitoring` through `createApp()` without any per-app
// registration (Requirements 2.1, 2.2; design Property P6).
//
// The engine (`@quant/error-monitoring`) provides `ErrorCapture` — a Sentry-style
// capture/forward pipeline (capture an exception → buffer an `ErrorEvent` →
// `flush()` to its transports). It is reused here AS-IS; no engine code changes.
//
// The seam, per the task: hook into the SAME error flow that `error-handler.ts`
// serves and capture/forward the error, correlated by `x-request-id`. We do this
// with Fastify's `onError` lifecycle hook rather than by re-implementing
// `setErrorHandler`:
//   - `error-handler.ts` keeps sole ownership of `setErrorHandler` and therefore
//     remains the ONLY producer of the `{ success:false, error }` envelope and
//     the HTTP status code — both are left completely untouched.
//   - `onError` receives the ORIGINAL thrown error (before the envelope is
//     serialized) and is explicitly "not intended for changing the error"; it is
//     the idiomatic place for custom error logging/forwarding. We only read from
//     the reply/request here, never mutate the response.
//
// Correlation: the `request-id.ts` plugin stamps `x-request-id` onto the reply in
// its `onRequest` hook, so by the time `onError` runs the id is available via
// `reply.getHeader('x-request-id')` (with request header / `request.id`
// fallbacks). We attach it to the captured event's context tags so the forwarded
// error can be correlated across the proxy → route → engine seam (design
// "Security Considerations": propagate `x-request-id` so error-monitoring can
// correlate; Requirement 8.5).
//
// Ordering: declared `dependencies: ['error-handler', 'request-id']` so this
// plugin always registers after both — guaranteeing the error handler that
// produces the envelope and the hook that stamps the correlation id are in place
// first (design Property P4 / "Error Handling": fail fast at boot on bad order).

/** Shape decorated onto the instance as `fastify.errorMonitoring`. */
export interface ErrorMonitoringService {
  /** The underlying `@quant/error-monitoring` capture/forward pipeline. */
  readonly capture: ErrorCapture;
  /**
   * Capture (and enqueue for forwarding) an error, tagging it with the request's
   * `x-request-id` for cross-seam correlation. Returns the captured `ErrorEvent`
   * so callers/tests can assert the correlation tag without flushing. Never
   * throws — capture failures must not disrupt the error-response lifecycle.
   */
  captureRequestError(
    error: Error,
    opts?: { requestId?: string; severity?: ErrorSeverity; extra?: Record<string, unknown> },
  ): ErrorEvent | null;
  /** Forward all buffered events to the configured sinks/transports. */
  flush(): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Shared error-capture/forward engine from `@quant/error-monitoring`. */
    errorMonitoring: ErrorMonitoringService;
  }
}

const REQUEST_ID_HEADER = 'x-request-id';

/** Resolve the correlation id the same way `request-id.ts` exposes it. */
function resolveRequestId(request: FastifyRequest, reply: FastifyReply): string | undefined {
  const fromReply = reply.getHeader(REQUEST_ID_HEADER);
  if (typeof fromReply === 'string' && fromReply.length > 0) return fromReply;

  const fromHeader = request.headers[REQUEST_ID_HEADER];
  if (typeof fromHeader === 'string' && fromHeader.length > 0) return fromHeader;

  return request.id;
}

async function errorMonitoringPlugin(fastify: FastifyInstance) {
  // Construct the engine's capture pipeline once at boot (a decorated singleton),
  // never per-request — mirroring `prisma.ts` / `notifications.ts`.
  const capture = new ErrorCapture({
    environment: process.env['NODE_ENV'] ?? 'production',
    debug: false,
  });

  // Forwarding sink is opt-in via config/secrets (never hardcoded): when a DSN is
  // present we forward to a Sentry-compatible transport, otherwise capture still
  // buffers events in-process (so the seam — and its test — work with zero
  // external dependencies). This mirrors observability's import-gated approach.
  const dsn = process.env['ERROR_MONITORING_DSN'] ?? process.env['SENTRY_DSN'];
  let sentryTransport: SentryTransport | undefined;
  if (dsn) {
    sentryTransport = new SentryTransport({ dsn });
    capture.addTransport(sentryTransport);
  }

  const service: ErrorMonitoringService = {
    capture,
    captureRequestError(error, opts = {}) {
      const { requestId, severity = 'error', extra } = opts;
      try {
        // setContext + captureException run synchronously back-to-back, so the
        // returned event deterministically snapshots these tags (no interleaving).
        const ctx = capture.getContext();
        capture.setContext({
          tags: {
            ...(ctx.tags ?? {}),
            ...(requestId ? { request_id: requestId } : {}),
          },
          ...(extra ? { extra: { ...(ctx.extra ?? {}), ...extra } } : {}),
        });
        return capture.captureException(error, severity);
      } catch {
        // Defensive: monitoring must never break the request/error lifecycle.
        return null;
      }
    },
    async flush() {
      try {
        await capture.flush();
      } catch {
        // Best-effort forwarding; swallow transport failures.
      }
    },
  };

  fastify.decorate('errorMonitoring', service);

  // The seam: capture/forward every error that flows to the error handler,
  // correlated by x-request-id. `onError` does NOT touch the envelope or status
  // — `error-handler.ts`'s `setErrorHandler` still produces both unchanged.
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    const requestId = resolveRequestId(request, reply);
    service.captureRequestError(error, {
      requestId,
      extra: { method: request.method, url: request.url },
    });
    // Best-effort forward; fire-and-forget so the error response is never blocked
    // or delayed by transport I/O.
    void service.flush();
  });

  // Flush any buffered events and release the transport's flush timer on shutdown.
  fastify.addHook('onClose', async () => {
    await service.flush();
    sentryTransport?.destroy();
  });
}

export default fp(errorMonitoringPlugin, {
  name: 'error-monitoring',
  dependencies: ['error-handler', 'request-id'],
  fastify: '5.x',
});
