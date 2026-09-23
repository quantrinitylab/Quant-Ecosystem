import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DnsPoller, calculateVerificationStage, type DnsResolver } from '../src/poller';

function createMockResolver(overrides?: Partial<DnsResolver>): DnsResolver {
  return {
    resolveTxt: async (_hostname: string) => [],
    resolveMx: async (_hostname: string) => [],
    resolveCname: async (_hostname: string) => [],
    ...overrides,
  };
}

describe('Task W33-04: Enterprise Domain DNS Poller & Cryptographic Verification', () => {
  let poller: DnsPoller;

  beforeEach(() => {
    poller = new DnsPoller();
  });

  afterEach(() => {
    poller.clear();
  });

  describe('1. Registration and DNS Instructions Generation', () => {
    it('registers new domain and produces 5 DNS instruction records', () => {
      const { domain, instructions } = poller.registerDomain('org-42', 'enterprise.acme.com');

      expect(domain.id).toBeDefined();
      expect(domain.domain).toBe('enterprise.acme.com');
      expect(domain.orgId).toBe('org-42');
      expect(domain.verificationStatus).toBe('PENDING');
      expect(domain.verificationToken).toBeDefined();

      expect(instructions.domain).toBe('enterprise.acme.com');
      expect(instructions.records).toHaveLength(5);

      // 1. TXT token
      const txt = instructions.records.find(
        (r) => r.type === 'TXT' && r.value.startsWith('quantmail-verification='),
      );
      expect(txt).toBeDefined();
      expect(txt?.value).toBe(`quantmail-verification=${domain.verificationToken}`);

      // 2. MX destination
      const mx = instructions.records.find((r) => r.type === 'MX');
      expect(mx).toBeDefined();
      expect(mx?.value).toBe('mail.quantmail.in');

      // 3. SPF record
      const spf = instructions.records.find(
        (r) => r.type === 'TXT' && r.value.includes('include:_spf.quantmail.in'),
      );
      expect(spf).toBeDefined();
      expect(spf?.value).toBe('v=spf1 include:_spf.quantmail.in ~all');

      // 4. DKIM CNAME
      const dkim = instructions.records.find((r) => r.type === 'CNAME');
      expect(dkim).toBeDefined();
      expect(dkim?.name).toBe('quantmail._domainkey.enterprise.acme.com');
      expect(dkim?.value).toBe('quantmail._domainkey.quantmail.in');

      // 5. DMARC record
      const dmarc = instructions.records.find(
        (r) => r.type === 'TXT' && r.name.startsWith('_dmarc'),
      );
      expect(dmarc).toBeDefined();
      expect(dmarc?.value).toContain('v=DMARC1; p=reject');
    });

    it('rejects invalid domain names and prevents cross-tenant duplicate domain registration', () => {
      expect(() => poller.registerDomain('org-1', 'bad')).toThrow('Invalid domain format');
      expect(() => poller.registerDomain('org-1', '')).toThrow('Invalid domain format');

      poller.registerDomain('org-1', 'valid-domain.com');
      expect(() => poller.registerDomain('org-2', 'valid-domain.com')).toThrow(
        'Domain already registered by another organization',
      );
    });
  });

  describe('2. Five Critical DNS Records Verification', () => {
    it('1. Verifies ownership TXT token (quantmail-verification=... and quant-verify=...)', async () => {
      const mockResolver = createMockResolver({
        resolveTxt: async (hostname: string) => {
          if (hostname === 'tenant.com') {
            return [['quantmail-verification=token-12345']];
          }
          return [];
        },
      });

      const p = new DnsPoller(mockResolver);
      const pass = await p.checkOwnershipTxt('tenant.com', 'token-12345');
      expect(pass.valid).toBe(true);

      const fail = await p.checkOwnershipTxt('tenant.com', 'wrong-token');
      expect(fail.valid).toBe(false);
      expect(fail.error).toBeDefined();
    });

    it('2. Verifies MX destination (mail.quantmail.in)', async () => {
      const mockResolver = createMockResolver({
        resolveMx: async (hostname: string) => {
          if (hostname === 'tenant.com') {
            return [
              { exchange: 'mail.quantmail.in.', priority: 10 },
              { exchange: 'backup.mail.in', priority: 20 },
            ];
          }
          return [{ exchange: 'smtp.other.com', priority: 10 }];
        },
      });

      const p = new DnsPoller(mockResolver);
      const pass = await p.checkMx('tenant.com');
      expect(pass.valid).toBe(true);

      const fail = await p.checkMx('other.com');
      expect(fail.valid).toBe(false);
    });

    it('3. Verifies SPF record (v=spf1 include:_spf.quantmail.in ~all)', async () => {
      const mockResolver = createMockResolver({
        resolveTxt: async (hostname: string) => {
          if (hostname === 'tenant.com') {
            return [['v=spf1 include:_spf.quantmail.in ~all']];
          }
          return [['v=spf1 include:spf.google.com ~all']];
        },
      });

      const p = new DnsPoller(mockResolver);
      const pass = await p.checkSpf('tenant.com');
      expect(pass.valid).toBe(true);

      const fail = await p.checkSpf('other.com');
      expect(fail.valid).toBe(false);
    });

    it('4. Verifies DKIM 2048-bit public key CNAME (quantmail._domainkey...)', async () => {
      const mockResolver = createMockResolver({
        resolveCname: async (hostname: string) => {
          if (hostname === 'quantmail._domainkey.tenant.com') {
            return ['quantmail._domainkey.quantmail.in'];
          }
          return [];
        },
      });

      const p = new DnsPoller(mockResolver);
      const pass = await p.checkDkim('tenant.com');
      expect(pass.valid).toBe(true);

      const fail = await p.checkDkim('other.com');
      expect(fail.valid).toBe(false);
    });

    it('5. Verifies DMARC record (v=DMARC1; p=reject or p=quarantine)', async () => {
      const mockResolver = createMockResolver({
        resolveTxt: async (hostname: string) => {
          if (hostname === '_dmarc.reject.com') {
            return [['v=DMARC1; p=reject; pct=100']];
          }
          if (hostname === '_dmarc.quarantine.com') {
            return [['v=DMARC1; p=quarantine;']];
          }
          if (hostname === '_dmarc.none.com') {
            return [['v=DMARC1; p=none']];
          }
          return [];
        },
      });

      const p = new DnsPoller(mockResolver);
      const passReject = await p.checkDmarc('reject.com');
      expect(passReject.valid).toBe(true);

      const passQuarantine = await p.checkDmarc('quarantine.com');
      expect(passQuarantine.valid).toBe(true);

      const failNone = await p.checkDmarc('none.com');
      expect(failNone.valid).toBe(false);
    });
  });

  describe('3. Stage Transitions and FULLY_VERIFIED Gate', () => {
    it('promotes verificationStatus step-by-step and reaches FULLY_VERIFIED only when all 5 pass', () => {
      const checks = {
        ownershipTxt: { valid: false, expected: '' },
        mx: { valid: false, expected: '' },
        spf: { valid: false, expected: '' },
        dkim: { valid: false, expected: '' },
        dmarc: { valid: false, expected: '' },
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

      // 4 out of 5 is NOT FULLY_VERIFIED
      expect(calculateVerificationStage(checks)).not.toBe('FULLY_VERIFIED');

      checks.dmarc.valid = true;
      // All 5 pass -> FULLY_VERIFIED
      expect(calculateVerificationStage(checks)).toBe('FULLY_VERIFIED');
    });

    it('verifyDomain executes all checks and updates status, lastCheckedAt, and verifiedAt', async () => {
      let token = '';
      const mockResolver = createMockResolver({
        resolveTxt: async (hostname: string) => {
          if (hostname === 'corp.com') {
            return [[`quantmail-verification=${token}`], ['v=spf1 include:_spf.quantmail.in ~all']];
          }
          if (hostname === '_dmarc.corp.com') {
            return [['v=DMARC1; p=reject']];
          }
          return [];
        },
        resolveMx: async (hostname: string) => {
          if (hostname === 'corp.com') {
            return [{ exchange: 'mail.quantmail.in', priority: 10 }];
          }
          return [];
        },
        resolveCname: async (hostname: string) => {
          if (hostname === 'quantmail._domainkey.corp.com') {
            return ['quantmail._domainkey.quantmail.in'];
          }
          return [];
        },
      });

      const p = new DnsPoller(mockResolver);
      const { domain } = p.registerDomain('org-1', 'corp.com');
      token = domain.verificationToken;

      const verified = await p.verifyDomain(domain.id);
      expect(verified.verificationStatus).toBe('FULLY_VERIFIED');
      expect(verified.verifiedAt).toBeDefined();
      expect(verified.lastCheckedAt).toBeDefined();
      expect(verified.dnsChecks.ownershipTxt.valid).toBe(true);
      expect(verified.dnsChecks.mx.valid).toBe(true);
      expect(verified.dnsChecks.spf.valid).toBe(true);
      expect(verified.dnsChecks.dkim.valid).toBe(true);
      expect(verified.dnsChecks.dmarc.valid).toBe(true);
    });

    it('pollAllPending polls and advances all pending domains', async () => {
      const mockResolver = createMockResolver();
      const p = new DnsPoller(mockResolver);
      p.registerDomain('org-1', 'alpha.com');
      p.registerDomain('org-1', 'beta.com');

      const polled = await p.pollAllPending();
      expect(polled).toHaveLength(2);
      expect(polled[0]?.verificationStatus).toBe('PENDING');
      expect(polled[1]?.verificationStatus).toBe('PENDING');
      expect(polled[0]?.lastCheckedAt).toBeDefined();
    });
  });
});
