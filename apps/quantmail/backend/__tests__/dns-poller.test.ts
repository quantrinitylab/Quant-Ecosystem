import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import enterpriseDomainsRoutes, { __setDnsPollerService } from '../routes/enterprise-domains';
import {
  DnsPollerService,
  calculateVerificationStage,
  type DnsResolver,
} from '../services/dns-poller.service';

function createMockResolver(overrides?: Partial<DnsResolver>): DnsResolver {
  return {
    resolveTxt: async (_hostname: string) => [],
    resolveMx: async (_hostname: string) => [],
    resolveCname: async (_hostname: string) => [],
    ...overrides,
  };
}

async function buildTestApp(userId?: string, orgId?: string) {
  const app = fastify();
  app.addHook('preHandler', async (req) => {
    if (userId) {
      (req as unknown as { auth?: { userId?: string; orgId?: string }; orgId?: string }).auth = {
        userId,
        orgId: orgId ?? 'org-test-1',
      };
      (req as unknown as { orgId?: string }).orgId = orgId ?? 'org-test-1';
    }
  });
  await app.register(enterpriseDomainsRoutes, { prefix: '/api/domains' });
  await app.register(enterpriseDomainsRoutes, { prefix: '/domains' });
  await app.ready();
  return app;
}

describe('Task W33-04: Automated Enterprise Domain DNS Poller & Cryptographic Verification', () => {
  let pollerService: DnsPollerService;

  beforeEach(() => {
    pollerService = new DnsPollerService();
    __setDnsPollerService(pollerService);
  });

  afterEach(() => {
    pollerService.clearStore();
    __setDnsPollerService(undefined);
  });

  describe('DnsPollerService Registration & DNS Instructions', () => {
    it('registers a custom domain and generates unique quant-verify token with 5 DNS instructions', () => {
      const { domain, instructions } = pollerService.registerDomain('org-123', 'acme-corp.com');

      expect(domain.id).toBeDefined();
      expect(domain.domain).toBe('acme-corp.com');
      expect(domain.orgId).toBe('org-123');
      expect(domain.verificationStatus).toBe('PENDING');
      expect(domain.verificationToken).toBeDefined();

      expect(instructions.domain).toBe('acme-corp.com');
      expect(instructions.records).toHaveLength(5);

      const txt = instructions.records.find(
        (r) =>
          r.type === 'TXT' && r.name === 'acme-corp.com' && r.value.startsWith('quant-verify='),
      );
      expect(txt).toBeDefined();
      expect(txt?.value).toBe(`quant-verify=${domain.verificationToken}`);

      const mx = instructions.records.find((r) => r.type === 'MX');
      expect(mx).toBeDefined();
      expect(mx?.value).toBe('mail.quantmail.in');
      expect(mx?.priority).toBe(10);

      const spf = instructions.records.find(
        (r) => r.type === 'TXT' && r.value.includes('include:_spf.quantmail.in'),
      );
      expect(spf).toBeDefined();

      const dkim = instructions.records.find((r) => r.type === 'CNAME');
      expect(dkim).toBeDefined();
      expect(dkim?.name).toBe('quantmail._domainkey.acme-corp.com');
      expect(dkim?.value).toBe('quantmail._domainkey.quantmail.in');

      const dmarc = instructions.records.find(
        (r) => r.type === 'TXT' && r.name.startsWith('_dmarc'),
      );
      expect(dmarc).toBeDefined();
      expect(dmarc?.value).toContain('v=DMARC1; p=reject');
    });

    it('rejects invalid domain names', () => {
      expect(() => pollerService.registerDomain('org-123', 'invalid')).toThrow();
      expect(() => pollerService.registerDomain('org-123', '')).toThrow();
    });

    it('rejects duplicate domain registration across different organizations', () => {
      pollerService.registerDomain('org-1', 'shared-domain.com');
      expect(() => pollerService.registerDomain('org-2', 'shared-domain.com')).toThrow();
    });
  });

  describe('Cryptographic & DNS Records Verification Logic', () => {
    it('verifies TXT ownership token correctly', async () => {
      const mockResolver = createMockResolver({
        resolveTxt: async (hostname: string) => {
          if (hostname === 'test.com') {
            return [['quant-verify=secret-token-xyz']];
          }
          return [];
        },
      });

      const service = new DnsPollerService(mockResolver);
      const pass = await service.checkOwnershipTxt('test.com', 'secret-token-xyz');
      expect(pass.valid).toBe(true);
      expect(pass.actual).toBe('quant-verify=secret-token-xyz');

      const fail = await service.checkOwnershipTxt('test.com', 'different-token');
      expect(fail.valid).toBe(false);
      expect(fail.error).toBeDefined();
    });

    it('verifies MX record pointing to mail.quantmail.in', async () => {
      const mockResolver = createMockResolver({
        resolveMx: async (hostname: string) => {
          if (hostname === 'test.com') {
            return [{ exchange: 'mail.quantmail.in.', priority: 10 }];
          }
          return [{ exchange: 'smtp.google.com', priority: 10 }];
        },
      });

      const service = new DnsPollerService(mockResolver);
      const pass = await service.checkMx('test.com');
      expect(pass.valid).toBe(true);

      const fail = await service.checkMx('other.com');
      expect(fail.valid).toBe(false);
    });

    it('verifies SPF record containing include:_spf.quantmail.in', async () => {
      const mockResolver = createMockResolver({
        resolveTxt: async (hostname: string) => {
          if (hostname === 'test.com') {
            return [['v=spf1 include:_spf.quantmail.in ~all']];
          }
          return [['v=spf1 include:_spf.google.com ~all']];
        },
      });

      const service = new DnsPollerService(mockResolver);
      const pass = await service.checkSpf('test.com');
      expect(pass.valid).toBe(true);

      const fail = await service.checkSpf('other.com');
      expect(fail.valid).toBe(false);
    });

    it('verifies DKIM 2048-bit CNAME key pointer', async () => {
      const mockResolver = createMockResolver({
        resolveCname: async (hostname: string) => {
          if (hostname === 'quantmail._domainkey.test.com') {
            return ['quantmail._domainkey.quantmail.in'];
          }
          return [];
        },
      });

      const service = new DnsPollerService(mockResolver);
      const pass = await service.checkDkim('test.com');
      expect(pass.valid).toBe(true);

      const fail = await service.checkDkim('other.com');
      expect(fail.valid).toBe(false);
    });

    it('verifies DMARC record (v=DMARC1; p=reject)', async () => {
      const mockResolver = createMockResolver({
        resolveTxt: async (hostname: string) => {
          if (hostname === '_dmarc.test.com') {
            return [['v=DMARC1; p=reject; rua=mailto:dmarc-reports@quantmail.in']];
          }
          return [['v=DMARC1; p=none']];
        },
      });

      const service = new DnsPollerService(mockResolver);
      const pass = await service.checkDmarc('test.com');
      expect(pass.valid).toBe(true);

      const fail = await service.checkDmarc('other.com');
      expect(fail.valid).toBe(false);
    });
  });

  describe('Stage Transitions Through 5 Records', () => {
    it('transitions verificationStatus step-by-step up to FULLY_VERIFIED only when all 5 pass', () => {
      const checks = {
        ownershipTxt: { valid: false, expected: '', actual: null },
        mx: { valid: false, expected: '', actual: null },
        spf: { valid: false, expected: '', actual: null },
        dkim: { valid: false, expected: '', actual: null },
        dmarc: { valid: false, expected: '', actual: null },
      };

      expect(calculateVerificationStage(checks)).toBe('PENDING');

      checks.ownershipTxt.valid = true;
      expect(calculateVerificationStage(checks)).toBe('TXT_VERIFIED');

      checks.mx.valid = true;
      expect(calculateVerificationStage(checks)).toBe('MX_VERIFIED');

      checks.spf.valid = true;
      expect(calculateVerificationStage(checks)).toBe('SPF_VERIFIED');

      checks.dkim.valid = true;
      expect(calculateVerificationStage(checks)).toBe('DKIM_VERIFIED');

      checks.dmarc.valid = true;
      expect(calculateVerificationStage(checks)).toBe('FULLY_VERIFIED');
    });

    it('verifyDomain executes all 5 checks and promotes domain to FULLY_VERIFIED', async () => {
      let registeredToken = '';
      const mockResolver = createMockResolver({
        resolveTxt: async (hostname: string) => {
          if (hostname === 'enterprise.com') {
            return [[`quant-verify=${registeredToken}`], ['v=spf1 include:_spf.quantmail.in ~all']];
          }
          if (hostname === '_dmarc.enterprise.com') {
            return [['v=DMARC1; p=reject;']];
          }
          return [];
        },
        resolveMx: async (hostname: string) => {
          if (hostname === 'enterprise.com') {
            return [{ exchange: 'mail.quantmail.in', priority: 10 }];
          }
          return [];
        },
        resolveCname: async (hostname: string) => {
          if (hostname === 'quantmail._domainkey.enterprise.com') {
            return ['quantmail._domainkey.quantmail.in'];
          }
          return [];
        },
      });

      const service = new DnsPollerService(mockResolver);
      const { domain } = service.registerDomain('org-100', 'enterprise.com');
      registeredToken = domain.verificationToken;

      const verified = await service.verifyDomain(domain.id);
      expect(verified.verificationStatus).toBe('FULLY_VERIFIED');
      expect(verified.dnsChecks.ownershipTxt.valid).toBe(true);
      expect(verified.dnsChecks.mx.valid).toBe(true);
      expect(verified.dnsChecks.spf.valid).toBe(true);
      expect(verified.dnsChecks.dkim.valid).toBe(true);
      expect(verified.dnsChecks.dmarc.valid).toBe(true);
      expect(verified.verifiedAt).toBeDefined();
    });

    it('pollAllPending polls all domains in non-fully-verified state', async () => {
      const service = new DnsPollerService(createMockResolver());
      const { domain: d1 } = service.registerDomain('org-1', 'domain1.com');
      const { domain: d2 } = service.registerDomain('org-1', 'domain2.com');

      const results = await service.pollAllPending();
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id)).toContain(d1.id);
      expect(results.map((r) => r.id)).toContain(d2.id);
    });
  });

  describe('Enterprise Domains HTTP Routes', () => {
    it('POST /api/domains/custom returns 201 with domain and DNS instructions', async () => {
      const app = await buildTestApp('user-1', 'org-abc');
      const res = await app.inject({
        method: 'POST',
        url: '/api/domains/custom',
        payload: {
          domain: 'corp.example.com',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.domain.domain).toBe('corp.example.com');
      expect(body.data.domain.verificationStatus).toBe('PENDING');
      expect(body.data.instructions.records).toHaveLength(5);
    });

    it('GET /api/domains lists domains for authenticated organization', async () => {
      pollerService.registerDomain('org-abc', 'domain-a.com');
      pollerService.registerDomain('org-abc', 'domain-b.com');
      pollerService.registerDomain('org-other', 'domain-other.com');

      const app = await buildTestApp('user-1', 'org-abc');
      const res = await app.inject({
        method: 'GET',
        url: '/api/domains',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.domains).toHaveLength(2);
      expect(body.data.domains.map((d: any) => d.domain)).toContain('domain-a.com');
      expect(body.data.domains.map((d: any) => d.domain)).toContain('domain-b.com');
    });

    it('POST /api/domains/:id/verify triggers manual verification check', async () => {
      const { domain } = pollerService.registerDomain('org-abc', 'verify-me.com');

      const app = await buildTestApp('user-1', 'org-abc');
      const res = await app.inject({
        method: 'POST',
        url: `/api/domains/${domain.id}/verify`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.domain.id).toBe(domain.id);
      expect(body.data.dnsChecks).toBeDefined();
    });

    it('DELETE /api/domains/:id removes custom domain', async () => {
      const { domain } = pollerService.registerDomain('org-abc', 'to-delete.com');

      const app = await buildTestApp('user-1', 'org-abc');
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/domains/${domain.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.deleted).toBe(true);

      expect(pollerService.getDomain(domain.id)).toBeUndefined();
    });

    it('returns 401 when unauthenticated', async () => {
      const app = await buildTestApp(undefined); // no userId
      const res = await app.inject({
        method: 'GET',
        url: '/api/domains',
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
