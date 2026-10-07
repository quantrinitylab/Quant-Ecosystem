import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface RequestLogEntry {
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  userAgent: string | undefined;
  ip: string | undefined;
  userId: string | undefined;
  contentLength: number | undefined;
}

async function requestLoggerPlugin(fastify: FastifyInstance) {
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const logEntry: RequestLogEntry = {
      requestId: request.id as string,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      userId: request.auth?.userId,
      contentLength: reply.getHeader('content-length') as number | undefined,
    };

    if (reply.statusCode >= 500) {
      request.log.error(logEntry, 'request completed with error');
    } else if (reply.statusCode >= 400) {
      request.log.warn(logEntry, 'request completed with client error');
    } else {
      request.log.info(logEntry, 'request completed');
    }
  });
}

export default fp(requestLoggerPlugin, {
  name: 'request-logger',
});
