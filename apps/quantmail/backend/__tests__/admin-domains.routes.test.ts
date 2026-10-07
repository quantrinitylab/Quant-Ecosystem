import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import adminRoutes, { __setAdminDnsService } from '../routes/admin';
import { DnsPollerService } from '../services/dns-poller.service';

/**
 * K9 (M19 Admin Domains + M20 DLP policies) route tests.
 *
 * All state is a deterministic in-memory Prisma stub — no database, no network.
 * DNS verification runs against a stubbed resolver injected via
 * `__setAdminDnsService`, so "Verify DNS" exercises the real check/merge logic
 * without leaving the box.
 */

// ── Prisma stub ──────────────────────────────────────────────────────────────

function makePrisma() {
  const orgs = [{ id: 'org-1', name: 'Acme Corp', slug: 'acme', plan: 'FREE' }];
  const domains: any[] = [];
  const policies: any[] = [];
  const audit: any[] = [];
  let seq = 1;

  return {
    _state: { orgs, domains, policies, audit },
    organization: {
      findMany: async () => orgs,
      findUnique: async ({ where }: any) =>
        orgs.find((o) => o.id === where?.id) ?? null,
    },
    organizationDomain: {
      findMany: async ({ where }: any) =>
        domains.filter((d) => !where?.organizationId || d.organizationId === where.organizationId),
      findUnique: async ({ where }: any) =>
        domains.find(
          (d) => (where?.id && d.id === where.id) || (where?.domain && d.domain === where.domain),
        ) ?? null,
      create: async ({ data }: any) => {
        const row = {
          id: `dom-${seq++}`,
          verificationStatus: 'PENDING',
          isPrimary: false,
          verifiedAt: null,
          createdAt: new Date('2026-10-08T00:00:00Z'),
          updatedAt: new Date('2026-10-08T00:00:00Z'),
          ...data,
        };
        domains.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = domains.find((d) => d.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      delete: async ({ where }: any) => {
        const index = domains.findIndex((d) => d.id === where.id);
        if (index === -1) throw new Error('not found');
        const [row] = domains.splice(index, 1);
        return row;
      },
    },
    enterpriseMailComplianceRule: {
      findMany: async ({ where }: any) =>
        policies.filter(
          (p) => !where?.organizationId || p.organizationId === where.organizationId,
        ),
    },
    auditLog: {
      create: async ({ data }: any) => {
        const row = { id: `audit-${seq++}`, ...data };
        audit.push(row);
        return row;
      },
    },
  };
}

async function buildTestApp(opts?: { userId?: string; role?: string }) {
  const app = fastify();
  await app.register(errorHandlerPlugin);
  const prisma = makePrisma();
  app.decorate('prisma', prisma as unknown as never);
  app.addHook('preHandler', async (req) => {
    if (opts?.userId) {
      (req as unknown as { auth?: unknown }).auth = { userId: opts.userId, role: opts.role };
    }
  });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.ready();
  return { app, prisma };
}

// ── Stubbed DNS resolvers ────────────────────────────────────────────────────

const ORG_DOMAIN = 'acme.example.com';
let currentToken = '';

function allPassResolver() {
  return {
    resolveTxt: async (hostname: string) => {
      if (hostname === ORG_DOMAIN) {
        return [
          [`quant-verify=${currentToken}`],
          ['v=spf1 include:_spf.quantmail.in ~all'],
        ];
      }
      if (hostname === `_dmarc.${ORG_DOMAIN}`) {
        return [['v=DMARC1; p=reject; rua=mailto:dmarc-reports@quantmail.in']];
      }
      return [];
    },
    resolveMx: async () => [{ exchange: 'mail.quantmail.in', priority: 10 }],
    resolveCname: async () => ['quantmail._domainkey.quantmail.in'],
  };
}

function failingResolver() {
  const err = Object.assign(new Error('query refused'), { code: 'ENODATA' });
  return {
    resolveTxt: async () => {
      throw err;
    },
    resolveMx: async () => {
      throw err;
    },
    resolveCname: async () => {
      throw err;
    },
  };
}

async function registerDomain(app: any, domain = ORG_DOMAIN, orgId = 'org-1') {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/mail/domains',
    payload: { domain, organizationId: orgId },
  });
  return res;
}

describe('K9 M19/M20 admin routes', () => {
  beforeEach(() => {
    currentToken = '';
    __setAdminDnsService(new DnsPollerService(allPassResolver()));
  });

  afterEach(() => {
    __setAdminDnsService(null);
  });

  describe('authorization — fails closed', () => {
    const ENDPOINTS: Array<[string, string, any?]> = [
      ['GET', '/admin/organizations'],
      ['GET', '/admin/mail/domains?organizationId=org-1'],
      ['POST', '/admin/mail/domains', { domain: 'x.example.com', organizationId: 'org-1' }],
      ['POST', '/admin/mail/domains/dom-1/verify', { organizationId: 'org-1' }],
      ['DELETE', '/admin/mail/domains/dom-1', { organizationId: 'org-1' }],
      ['GET', '/admin/mail/dlp/policies?organizationId=org-1'],
      ['GET', '/admin/audit/logs'],
    ];

    for (const [method, url, payload] of ENDPOINTS) {
      it(`returns 401 for unauthenticated ${method} ${url}`, async () => {
        const { app } = await buildTestApp();
        const res = await app.inject({ method: method as any, url, payload });
        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe('UNAUTHORIZED');
      });

      it(`returns 403 for signed-in non-staff ${method} ${url}`, async () => {
        const { app } = await buildTestApp({ userId: 'user-1', role: 'USER' });
        const res = await app.inject({ method: method as any, url, payload });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('FORBIDDEN');
      });
    }

    it('lets MODERATOR staff through (mirrors the frontend AdminGuard)', async () => {
      const { app } = await buildTestApp({ userId: 'mod-1', role: 'MODERATOR' });
      const res = await app.inject({ method: 'GET', url: '/admin/organizations' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('organization scope — fails closed', () => {
    it('returns 400 ORGANIZATION_SCOPE_REQUIRED when listing domains without a scope', async () => {
      const { app } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const res = await app.inject({ method: 'GET', url: '/admin/mail/domains' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('ORGANIZATION_SCOPE_REQUIRED');
    });

    it('returns 400 when registering a domain without a scope', async () => {
      const { app } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const res = await app.inject({
        method: 'POST',
        url: '/admin/mail/domains',
        payload: { domain: 'x.example.com' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('ORGANIZATION_SCOPE_REQUIRED');
    });
  });

  describe('GET /admin/organizations', () => {
    it('lists real organizations', async () => {
      const { app } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const res = await app.inject({ method: 'GET', url: '/admin/organizations' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.organizations).toHaveLength(1);
      expect(body.data.organizations[0]).toMatchObject({ id: 'org-1', slug: 'acme' });
    });
  });

  describe('M19 mail domains', () => {
    it('lists an empty set honestly when the org has no domains', async () => {
      const { app } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/mail/domains?organizationId=org-1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.domains).toEqual([]);
    });

    it('registers a domain (201) with DNS instructions and writes a server-side audit record', async () => {
      const { app, prisma } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const res = await registerDomain(app);
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.domain.domain).toBe(ORG_DOMAIN);
      expect(body.data.domain.verificationStatus).toBe('PENDING');
      expect(body.data.domain.dnsChecklist).toHaveLength(5);
      expect(body.data.domain.dnsChecklist.every((c: any) => c.status === 'pending')).toBe(true);
      // DNS instructions include the TXT verification token the admin must publish.
      expect(body.data.verificationToken).toBeTruthy();
      expect(body.data.instructions.records.length).toBeGreaterThanOrEqual(4);

      // Server-side audit write: actor + action + resource, no client involvement.
      const auditRows = prisma._state.audit;
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toMatchObject({
        userId: 'admin-1',
        orgId: 'org-1',
        action: 'admin.mail.domain.register',
        resource: 'mail_domain',
      });
      expect(auditRows[0].metadata.domain).toBe(ORG_DOMAIN);
    });

    it('rejects an invalid domain with 400 INVALID_DOMAIN', async () => {
      const { app } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const res = await app.inject({
        method: 'POST',
        url: '/admin/mail/domains',
        payload: { domain: 'not a domain!!', organizationId: 'org-1' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_DOMAIN');
    });

    it('returns 404 ORGANIZATION_NOT_FOUND for an unknown organization', async () => {
      const { app } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const res = await app.inject({
        method: 'POST',
        url: '/admin/mail/domains',
        payload: { domain: 'x.example.com', organizationId: 'org-nope' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('ORGANIZATION_NOT_FOUND');
    });

    it('reports alreadyRegistered on a duplicate within the same org (no second audit row)', async () => {
      const { app, prisma } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      await registerDomain(app);
      const res = await registerDomain(app);
      expect(res.statusCode).toBe(200);
      expect(res.json().data.alreadyRegistered).toBe(true);
      expect(prisma._state.audit).toHaveLength(1);
    });

    it('returns 409 DOMAIN_CONFLICT when the domain belongs to another org', async () => {
      const { app, prisma } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      await registerDomain(app);
      prisma._state.orgs.push({ id: 'org-2', name: 'Other', slug: 'other', plan: 'FREE' });
      const res = await app.inject({
        method: 'POST',
        url: '/admin/mail/domains',
        payload: { domain: ORG_DOMAIN, organizationId: 'org-2' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('DOMAIN_CONFLICT');
    });

    it('verifies a domain against live (stubbed) DNS → FULLY_VERIFIED with per-check detail', async () => {
      const { app, prisma } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const regRes = await registerDomain(app);
      const domainId = regRes.json().data.domain.id;
      currentToken = regRes.json().data.verificationToken;

      const res = await app.inject({
        method: 'POST',
        url: `/admin/mail/domains/${domainId}/verify`,
        payload: { organizationId: 'org-1' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.domain.verificationStatus).toBe('FULLY_VERIFIED');
      expect(body.data.domain.verifiedAt).toBeTruthy();
      expect(body.data.domain.dnsChecklist.every((c: any) => c.status === 'verified')).toBe(true);
      expect(body.data.dnsChecks).toHaveLength(5);
      expect(body.data.dnsChecks.every((c: any) => c.valid)).toBe(true);

      const verifyAudit = prisma._state.audit.find(
        (a: any) => a.action === 'admin.mail.domain.verify',
      );
      expect(verifyAudit).toBeTruthy();
      expect(verifyAudit.metadata.verificationStatus).toBe('FULLY_VERIFIED');
    });

    it('leaves the stage at PENDING when DNS checks fail', async () => {
      __setAdminDnsService(new DnsPollerService(failingResolver()));
      const { app } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const regRes = await registerDomain(app);
      const domainId = regRes.json().data.domain.id;

      const res = await app.inject({
        method: 'POST',
        url: `/admin/mail/domains/${domainId}/verify`,
        payload: { organizationId: 'org-1' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.domain.verificationStatus).toBe('PENDING');
      expect(body.data.dnsChecks.every((c: any) => !c.valid)).toBe(true);
    });

    it('returns 404 DOMAIN_NOT_FOUND when verifying an unknown domain', async () => {
      const { app } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const res = await app.inject({
        method: 'POST',
        url: '/admin/mail/domains/dom-nope/verify',
        payload: { organizationId: 'org-1' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('DOMAIN_NOT_FOUND');
    });

    it('rejects verify/delete for a domain in another organization (403)', async () => {
      const { app, prisma } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const regRes = await registerDomain(app);
      const domainId = regRes.json().data.domain.id;
      // Simulate another org owning the row.
      prisma._state.domains[0].organizationId = 'org-2';

      const verifyRes = await app.inject({
        method: 'POST',
        url: `/admin/mail/domains/${domainId}/verify`,
        payload: { organizationId: 'org-1' },
      });
      expect(verifyRes.statusCode).toBe(403);
      expect(verifyRes.json().error.code).toBe('ORGANIZATION_SCOPE_MISMATCH');

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/admin/mail/domains/${domainId}`,
        payload: { organizationId: 'org-1' },
      });
      expect(deleteRes.statusCode).toBe(403);
    });

    it('removes a domain and writes a server-side audit record', async () => {
      const { app, prisma } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const regRes = await registerDomain(app);
      const domainId = regRes.json().data.domain.id;

      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/mail/domains/${domainId}`,
        payload: { organizationId: 'org-1' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.removed).toBe(true);
      expect(prisma._state.domains).toHaveLength(0);
      expect(
        prisma._state.audit.find((a: any) => a.action === 'admin.mail.domain.remove'),
      ).toBeTruthy();

      const listRes = await app.inject({
        method: 'GET',
        url: '/admin/mail/domains?organizationId=org-1',
      });
      expect(listRes.json().data.domains).toEqual([]);
    });

    it('returns 404 when deleting an unknown domain', async () => {
      const { app } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const res = await app.inject({
        method: 'DELETE',
        url: '/admin/mail/domains/dom-nope',
        payload: { organizationId: 'org-1' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('DOMAIN_NOT_FOUND');
    });
  });

  describe('M20 DLP policies', () => {
    it('lists an empty set honestly when no policies exist', async () => {
      const { app } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/mail/dlp/policies?organizationId=org-1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.policies).toEqual([]);
    });

    it('serializes real policy rows', async () => {
      const { app, prisma } = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
      prisma._state.policies.push({
        id: 'pol-1',
        organizationId: 'org-1',
        name: 'Block credit cards',
        description: 'Blocks outbound PANs',
        ruleType: 'LUHN_CREDIT_CARD',
        action: 'BLOCK',
        severity: 'HIGH',
        enabled: true,
        createdAt: new Date('2026-10-01T00:00:00Z'),
        updatedAt: new Date('2026-10-02T00:00:00Z'),
      });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/mail/dlp/policies?organizationId=org-1',
      });
      expect(res.statusCode).toBe(200);
      const policies = res.json().data.policies;
      expect(policies).toHaveLength(1);
      expect(policies[0]).toMatchObject({
        id: 'pol-1',
        name: 'Block credit cards',
        ruleType: 'LUHN_CREDIT_CARD',
        action: 'BLOCK',
        enabled: true,
      });
    });
  });
});
