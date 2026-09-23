import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { DnsPollerService, defaultDnsPollerService } from '../services/dns-poller.service';

let pollerServiceSingleton: DnsPollerService | undefined;

export function __setDnsPollerService(service: DnsPollerService | undefined): void {
  pollerServiceSingleton = service;
}

function getService(): DnsPollerService {
  return pollerServiceSingleton ?? defaultDnsPollerService;
}

function requireUserId(request: FastifyRequest): string {
  const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function resolveOrgId(request: FastifyRequest, bodyOrgId?: string): string {
  if (bodyOrgId?.trim()) return bodyOrgId.trim();
  const req = request as unknown as {
    orgId?: string;
    auth?: { orgId?: string; userId?: string };
  };
  return req.orgId || req.auth?.orgId || req.auth?.userId || 'default-org';
}

const registerDomainSchema = z.object({
  domain: z.string().trim().min(3).max(255),
  orgId: z.string().trim().optional(),
});

export default async function enterpriseDomainsRoutes(fastify: FastifyInstance) {
  // POST /custom or /api/domains/custom: Register a new custom domain
  fastify.post('/custom', async (request, reply) => {
    requireUserId(request);
    const parsed = registerDomainSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid domain payload',
        400,
        'VALIDATION_ERROR',
      );
    }

    const orgId = resolveOrgId(request, parsed.data.orgId);
    const service = getService();
    const result = service.registerDomain(orgId, parsed.data.domain);

    return reply.status(201).send({
      success: true,
      data: {
        domain: result.domain,
        instructions: result.instructions,
      },
    });
  });

  // GET / or /api/domains: List all domains for the authenticated org
  fastify.get('/', async (request, reply) => {
    requireUserId(request);
    const query = request.query as { orgId?: string } | undefined;
    const orgId = resolveOrgId(request, query?.orgId);
    const service = getService();
    const domains = service.listDomains(orgId);

    return reply.send({
      success: true,
      data: {
        domains,
      },
    });
  });

  // POST /:id/verify or /api/domains/:id/verify: Trigger manual DNS verification
  fastify.post<{ Params: { id: string } }>('/:id/verify', async (request, reply) => {
    requireUserId(request);
    const domainId = request.params.id;
    const service = getService();
    const verifiedDomain = await service.verifyDomain(domainId);

    return reply.send({
      success: true,
      data: {
        domain: verifiedDomain,
        verificationStatus: verifiedDomain.verificationStatus,
        dnsChecks: verifiedDomain.dnsChecks,
      },
    });
  });

  // DELETE /:id or /api/domains/:id: Remove a custom domain
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    requireUserId(request);
    const domainId = request.params.id;
    const orgId = resolveOrgId(request);
    const service = getService();
    const deleted = service.deleteDomain(domainId, orgId);

    if (!deleted) {
      throw createAppError('Domain not found', 404, 'DOMAIN_NOT_FOUND');
    }

    return reply.send({
      success: true,
      data: {
        deleted: true,
        id: domainId,
      },
    });
  });
}
