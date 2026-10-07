import * as dns from 'node:dns/promises';
import { randomUUID } from 'node:crypto';

export type DomainVerificationStatus =
  | 'PENDING'
  | 'TXT_VERIFIED'
  | 'MX_VERIFIED'
  | 'SPF_VERIFIED'
  | 'DKIM_VERIFIED'
  | 'DMARC_VERIFIED'
  | 'FULLY_VERIFIED'
  | 'FAILED';

export interface DnsRecordVerification {
  valid: boolean;
  expected: string;
  actual?: string | string[] | null;
  error?: string | null;
}

export interface DnsCheckResults {
  ownershipTxt: DnsRecordVerification;
  mx: DnsRecordVerification;
  spf: DnsRecordVerification;
  dkim: DnsRecordVerification;
  dmarc: DnsRecordVerification;
}

export interface OrganizationDomain {
  id: string;
  orgId: string;
  domain: string;
  verificationToken: string;
  verificationStatus: DomainVerificationStatus;
  dnsChecks: DnsCheckResults;
  lastCheckedAt?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DnsInstructionRecord {
  type: 'TXT' | 'MX' | 'CNAME';
  name: string;
  value: string;
  priority?: number;
  description: string;
}

export interface DnsInstructions {
  domain: string;
  verificationToken: string;
  records: DnsInstructionRecord[];
}

export interface DnsResolver {
  resolveTxt: (hostname: string) => Promise<string[][]>;
  resolveMx: (hostname: string) => Promise<Array<{ exchange: string; priority: number }>>;
  resolveCname: (hostname: string) => Promise<string[]>;
}

export function calculateVerificationStage(checks: DnsCheckResults): DomainVerificationStatus {
  const { ownershipTxt, mx, spf, dkim, dmarc } = checks;

  if (ownershipTxt.valid && mx.valid && spf.valid && dkim.valid && dmarc.valid) {
    return 'FULLY_VERIFIED';
  }
  if (ownershipTxt.valid && mx.valid && spf.valid && dkim.valid) {
    return 'DKIM_VERIFIED';
  }
  if (ownershipTxt.valid && mx.valid && spf.valid) {
    return 'SPF_VERIFIED';
  }
  if (ownershipTxt.valid && mx.valid) {
    return 'MX_VERIFIED';
  }
  if (ownershipTxt.valid) {
    return 'TXT_VERIFIED';
  }
  return 'PENDING';
}

export class DnsPoller {
  private readonly domains = new Map<string, OrganizationDomain>();
  private readonly resolver: DnsResolver;
  private pollerTimer?: ReturnType<typeof setInterval>;

  constructor(customResolver?: Partial<DnsResolver>) {
    this.resolver = {
      resolveTxt: customResolver?.resolveTxt ?? dns.resolveTxt,
      resolveMx: customResolver?.resolveMx ?? dns.resolveMx,
      resolveCname: customResolver?.resolveCname ?? dns.resolveCname,
    };
  }

  getInstructions(domain: string, verificationToken: string): DnsInstructions {
    const normalizedDomain = domain.trim().toLowerCase();

    return {
      domain: normalizedDomain,
      verificationToken,
      records: [
        {
          type: 'TXT',
          name: normalizedDomain,
          value: `quantmail-verification=${verificationToken}`,
          description: 'Domain ownership verification token',
        },
        {
          type: 'MX',
          name: normalizedDomain,
          value: 'mail.quantmail.in',
          priority: 10,
          description: 'Inbound mail routing exchange',
        },
        {
          type: 'TXT',
          name: normalizedDomain,
          value: 'v=spf1 include:_spf.quantmail.in ~all',
          description: 'Sender Policy Framework (SPF) authorization',
        },
        {
          type: 'CNAME',
          name: `quantmail._domainkey.${normalizedDomain}`,
          value: 'quantmail._domainkey.quantmail.in',
          description: 'DKIM 2048-bit public key CNAME',
        },
        {
          type: 'TXT',
          name: `_dmarc.${normalizedDomain}`,
          value: 'v=DMARC1; p=reject; rua=mailto:dmarc-reports@quantmail.in',
          description: 'DMARC email authentication & alignment policy',
        },
      ],
    };
  }

  registerDomain(
    orgId: string,
    rawDomain: string,
  ): { domain: OrganizationDomain; instructions: DnsInstructions } {
    const domain = rawDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!domain || !domain.includes('.') || domain.length < 3) {
      throw new Error('Invalid domain format');
    }

    const existing = Array.from(this.domains.values()).find((d) => d.domain === domain);
    if (existing) {
      if (existing.orgId !== orgId) {
        throw new Error('Domain already registered by another organization');
      }
      return {
        domain: existing,
        instructions: this.getInstructions(domain, existing.verificationToken),
      };
    }

    const id = randomUUID();
    const verificationToken = randomUUID();
    const now = new Date().toISOString();

    const emptyChecks: DnsCheckResults = {
      ownershipTxt: {
        valid: false,
        expected: `quantmail-verification=${verificationToken}`,
        actual: null,
      },
      mx: { valid: false, expected: 'mail.quantmail.in', actual: null },
      spf: { valid: false, expected: 'v=spf1 include:_spf.quantmail.in ~all', actual: null },
      dkim: { valid: false, expected: 'quantmail._domainkey.quantmail.in', actual: null },
      dmarc: { valid: false, expected: 'v=DMARC1; p=reject', actual: null },
    };

    const newDomain: OrganizationDomain = {
      id,
      orgId,
      domain,
      verificationToken,
      verificationStatus: 'PENDING',
      dnsChecks: emptyChecks,
      createdAt: now,
      updatedAt: now,
    };

    this.domains.set(id, newDomain);
    const instructions = this.getInstructions(domain, verificationToken);

    return { domain: newDomain, instructions };
  }

  getDomain(id: string): OrganizationDomain | undefined {
    return this.domains.get(id);
  }

  listDomains(orgId?: string): OrganizationDomain[] {
    const all = Array.from(this.domains.values());
    if (orgId) {
      return all.filter((d) => d.orgId === orgId);
    }
    return all;
  }

  deleteDomain(id: string, orgId?: string): boolean {
    const domain = this.domains.get(id);
    if (!domain) return false;
    if (orgId && domain.orgId !== orgId) {
      throw new Error('Forbidden: domain belongs to another organization');
    }
    return this.domains.delete(id);
  }

  // 1. Ownership TXT token (quantmail-verification=... or quant-verify=...)
  async checkOwnershipTxt(domain: string, token: string): Promise<DnsRecordVerification> {
    const primaryExpected = `quantmail-verification=${token}`;
    const altExpected = `quant-verify=${token}`;

    try {
      let txtRecords: string[][] = [];
      try {
        txtRecords = await this.resolver.resolveTxt(domain);
      } catch (err: any) {
        if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
          // ignore to attempt subdomain
        }
      }

      if (!txtRecords.length) {
        try {
          txtRecords = await this.resolver.resolveTxt(`_quantmail-verify.${domain}`);
        } catch {
          try {
            txtRecords = await this.resolver.resolveTxt(`_quant-verify.${domain}`);
          } catch {
            // ignore
          }
        }
      }

      const flatRecords = txtRecords.map((chunks) => chunks.join(''));
      const matched = flatRecords.find(
        (r) =>
          r.trim() === primaryExpected ||
          r.includes(primaryExpected) ||
          r.trim() === altExpected ||
          r.includes(altExpected) ||
          r.trim() === token,
      );

      if (matched) {
        return { valid: true, expected: primaryExpected, actual: matched };
      }
      return {
        valid: false,
        expected: primaryExpected,
        actual: flatRecords.length > 0 ? flatRecords : null,
        error: `TXT ownership token record not found for domain ${domain}`,
      };
    } catch (err: any) {
      return {
        valid: false,
        expected: primaryExpected,
        actual: null,
        error: err.message || 'DNS query failed',
      };
    }
  }

  // 2. MX destination (mail.quantmail.in)
  async checkMx(domain: string): Promise<DnsRecordVerification> {
    const expected = 'mail.quantmail.in';
    try {
      const mxRecords = await this.resolver.resolveMx(domain);
      const matched = mxRecords.find((r) => {
        const exchange = (r.exchange ?? '').toLowerCase().replace(/\.$/, '');
        return exchange === expected.toLowerCase();
      });

      if (matched) {
        return { valid: true, expected, actual: `${matched.priority} ${matched.exchange}` };
      }
      return {
        valid: false,
        expected,
        actual: mxRecords.map((r) => `${r.priority} ${r.exchange}`),
        error: `MX record pointing to '${expected}' not found`,
      };
    } catch (err: any) {
      return { valid: false, expected, actual: null, error: err.message || 'DNS query failed' };
    }
  }

  // 3. SPF record (v=spf1 include:_spf.quantmail.in ~all)
  async checkSpf(domain: string): Promise<DnsRecordVerification> {
    const expectedInclude = 'include:_spf.quantmail.in';
    const expected = 'v=spf1 include:_spf.quantmail.in ~all';

    try {
      const txtRecords = await this.resolver.resolveTxt(domain);
      const flatRecords = txtRecords.map((chunks) => chunks.join(''));
      const spfRecord = flatRecords.find((r) => {
        const lower = r.toLowerCase();
        return lower.startsWith('v=spf1') && lower.includes(expectedInclude.toLowerCase());
      });

      if (spfRecord) {
        return { valid: true, expected, actual: spfRecord };
      }
      return {
        valid: false,
        expected,
        actual: flatRecords.filter((r) => r.toLowerCase().startsWith('v=spf1')),
        error: `SPF record containing '${expectedInclude}' not found`,
      };
    } catch (err: any) {
      return { valid: false, expected, actual: null, error: err.message || 'DNS query failed' };
    }
  }

  // 4. DKIM 2048-bit public key CNAME (quantmail._domainkey...)
  async checkDkim(domain: string): Promise<DnsRecordVerification> {
    const expected = 'quantmail._domainkey.quantmail.in';
    const selectorDomain = `quantmail._domainkey.${domain}`;

    try {
      let cnames: string[] = [];
      try {
        cnames = await this.resolver.resolveCname(selectorDomain);
      } catch {
        try {
          cnames = await this.resolver.resolveCname(`default._domainkey.${domain}`);
        } catch {
          // ignore
        }
      }

      const matched = cnames.find((c) => {
        const normalized = c.toLowerCase().replace(/\.$/, '');
        return (
          normalized === expected.toLowerCase() ||
          normalized.includes('quantmail.in') ||
          normalized.includes('_domainkey')
        );
      });

      if (matched || cnames.length > 0) {
        return { valid: true, expected, actual: cnames[0] ?? matched };
      }
      return {
        valid: false,
        expected,
        actual: null,
        error: `DKIM CNAME record at '${selectorDomain}' not found`,
      };
    } catch (err: any) {
      return { valid: false, expected, actual: null, error: err.message || 'DNS query failed' };
    }
  }

  // 5. DMARC record (v=DMARC1; p=reject or p=quarantine)
  async checkDmarc(domain: string): Promise<DnsRecordVerification> {
    const expected = 'v=DMARC1; p=reject';
    const dmarcDomain = `_dmarc.${domain}`;

    try {
      const txtRecords = await this.resolver.resolveTxt(dmarcDomain);
      const flatRecords = txtRecords.map((chunks) => chunks.join(''));
      const dmarcRecord = flatRecords.find((r) => {
        const lower = r.toLowerCase();
        return (
          lower.includes('v=dmarc1') &&
          (lower.includes('p=reject') || lower.includes('p=quarantine'))
        );
      });

      if (dmarcRecord) {
        return { valid: true, expected, actual: dmarcRecord };
      }
      return {
        valid: false,
        expected,
        actual: flatRecords.filter((r) => r.toLowerCase().includes('v=dmarc1')),
        error: `DMARC record with p=reject or p=quarantine not found at ${dmarcDomain}`,
      };
    } catch (err: any) {
      return { valid: false, expected, actual: null, error: err.message || 'DNS query failed' };
    }
  }

  async verifyDomainRecords(domain: string, verificationToken: string): Promise<DnsCheckResults> {
    const [ownershipTxt, mx, spf, dkim, dmarc] = await Promise.all([
      this.checkOwnershipTxt(domain, verificationToken),
      this.checkMx(domain),
      this.checkSpf(domain),
      this.checkDkim(domain),
      this.checkDmarc(domain),
    ]);

    return {
      ownershipTxt,
      mx,
      spf,
      dkim,
      dmarc,
    };
  }

  async verifyDomain(id: string): Promise<OrganizationDomain> {
    const domain = this.domains.get(id);
    if (!domain) {
      throw new Error(`Domain not found: ${id}`);
    }

    const dnsChecks = await this.verifyDomainRecords(domain.domain, domain.verificationToken);
    const verificationStatus = calculateVerificationStage(dnsChecks);
    const now = new Date().toISOString();

    domain.dnsChecks = dnsChecks;
    domain.verificationStatus = verificationStatus;
    domain.lastCheckedAt = now;
    if (verificationStatus === 'FULLY_VERIFIED' && !domain.verifiedAt) {
      domain.verifiedAt = now;
    }
    domain.updatedAt = now;

    return domain;
  }

  async pollAllPending(): Promise<OrganizationDomain[]> {
    const pending = Array.from(this.domains.values()).filter(
      (d) => d.verificationStatus !== 'FULLY_VERIFIED',
    );
    const results: OrganizationDomain[] = [];
    for (const domain of pending) {
      const updated = await this.verifyDomain(domain.id);
      results.push(updated);
    }
    return results;
  }

  startPoller(intervalMs: number = 60000): void {
    if (this.pollerTimer) return;
    this.pollerTimer = setInterval(() => {
      this.pollAllPending().catch(() => {});
    }, intervalMs);
  }

  stopPoller(): void {
    if (this.pollerTimer) {
      clearInterval(this.pollerTimer);
      this.pollerTimer = undefined;
    }
  }

  clear(): void {
    this.domains.clear();
    this.stopPoller();
  }
}

export const defaultDnsPoller = new DnsPoller();
