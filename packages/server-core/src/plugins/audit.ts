import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuditLogger, AuditAction } from '@quant/audit';

declare module 'fastify' {
  interface FastifyInstance {
    audit: AuditLogger;
  }
}

const SENSITIVE_PATHS = ['/api/users', '/api/settings', '/api/admin', '/api/auth'];

async function auditPlugin(fastify: FastifyInstance) {
  const auditLogger = new AuditLogger();

  fastify.decorate('audit', auditLogger);

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url;
    const isSensitive = SENSITIVE_PATHS.some((p) => path.startsWith(p));

    if (!isSensitive) return;

    const userId = request.auth?.userId ?? 'anonymous';

    auditLogger.log({
      userId,
      action: AuditAction.DATA_ACCESS,
      resource: path,
      metadata: {
        method: request.method,
        statusCode: reply.statusCode,
      },
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  });
}

export default fp(auditPlugin, {
  name: 'audit',
});
