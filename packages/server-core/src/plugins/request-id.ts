import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Safe pattern for request/trace IDs: alphanumeric, underscores, hyphens, max 128 chars.
 * This prevents log injection via control characters or overly long values.
 */
const SAFE_ID_PATTERN = /^[\w\-]{1,128}$/;

function validateHeaderId(value: string | undefined): string | undefined {
  if (value && SAFE_ID_PATTERN.test(value)) {
    return value;
  }
  return undefined;
}

async function requestIdPlugin(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId =
      validateHeaderId(request.headers['x-request-id'] as string | undefined) ??
      request.id ??
      randomUUID();
    const traceId =
      validateHeaderId(request.headers['x-trace-id'] as string | undefined) ?? randomUUID();

    // Set response headers
    void reply.header('x-request-id', requestId);
    void reply.header('x-trace-id', traceId);

    // Add to Pino log context
    request.log = request.log.child({ request_id: requestId, trace_id: traceId });
  });
}

export default fp(requestIdPlugin, {
  name: 'request-id',
});
