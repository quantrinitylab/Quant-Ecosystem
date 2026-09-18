import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { DeliverabilityService } from '../services/deliverability.service';

const deliverabilityService = new DeliverabilityService();

function requireUserId(request: FastifyRequest): string {
  const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

const addSuppressionSchema = z.object({
  email: z.string().trim().email(),
  reason: z.enum(['HARD_BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE']).default('HARD_BOUNCE'),
  source: z.string().optional().default('admin-console'),
});

const dmarcReportPayloadSchema = z.object({
  xmlData: z.string().min(1, 'XML data is required'),
});

export default async function deliverabilityRoutes(fastify: FastifyInstance) {
  // Allow text/xml parsing
  fastify.addContentTypeParser(
    ['text/xml', 'application/xml'],
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // POST /deliverability/dmarc-reports - Ingest RFC 7489 DMARC XML report
  fastify.post('/dmarc-reports', async (request, reply) => {
    let xmlContent = '';
    if (typeof request.body === 'string') {
      xmlContent = request.body;
    } else if (typeof request.body === 'object' && request.body !== null) {
      const parsed = dmarcReportPayloadSchema.safeParse(request.body);
      if (!parsed.success) {
        throw createAppError(
          parsed.error.errors[0]?.message || 'Invalid payload',
          400,
          'VALIDATION_ERROR',
        );
      }
      xmlContent = parsed.data.xmlData;
    } else {
      throw createAppError(
        'Invalid payload: expected XML string or JSON { xmlData }',
        400,
        'INVALID_PAYLOAD',
      );
    }

    const report = await deliverabilityService.ingestDmarcReport(xmlContent);
    return reply.status(201).send({
      success: true,
      data: report,
    });
  });

  // GET /deliverability/stats - Deliverability dashboard metrics
  fastify.get('/stats', async (request, reply) => {
    const query = request.query as { domain?: string };
    const stats = await deliverabilityService.getDeliverabilityStats(query?.domain);
    return reply.send({
      success: true,
      data: stats,
    });
  });

  // GET /deliverability/suppression - List suppressed addresses
  fastify.get('/suppression', async (request, reply) => {
    requireUserId(request);
    const query = request.query as { reason?: 'HARD_BOUNCE' | 'COMPLAINT' | 'UNSUBSCRIBE' };
    const list = await deliverabilityService.getSuppressionList(query);
    return reply.send({
      success: true,
      data: list,
    });
  });

  // GET /deliverability/suppression/check - Check if specific address is suppressed
  fastify.get<{ Querystring: { email?: string } }>('/suppression/check', async (request, reply) => {
    requireUserId(request);
    const email = request.query?.email;
    if (!email) {
      throw createAppError('Missing email query parameter', 400, 'MISSING_EMAIL');
    }
    const suppressed = await deliverabilityService.isSuppressed(email);
    return reply.send({
      success: true,
      data: { email, suppressed },
    });
  });

  // POST /deliverability/suppression - Add address to suppression list
  fastify.post('/suppression', async (request, reply) => {
    requireUserId(request);
    const parsed = addSuppressionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid email address',
        400,
        'VALIDATION_ERROR',
      );
    }

    const entry = await deliverabilityService.addSuppression(
      parsed.data.email,
      parsed.data.reason,
      parsed.data.source,
    );

    return reply.status(201).send({
      success: true,
      data: entry,
    });
  });

  // DELETE /deliverability/suppression/:email - Remove address from suppression list
  fastify.delete<{ Params: { email: string } }>('/suppression/:email', async (request, reply) => {
    requireUserId(request);
    const email = decodeURIComponent(request.params.email);
    const removed = await deliverabilityService.removeSuppression(email);
    return reply.send({
      success: true,
      data: { email, removed },
    });
  });
}
