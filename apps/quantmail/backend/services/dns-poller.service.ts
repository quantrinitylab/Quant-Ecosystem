import * as dns from 'node:dns/promises';
import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';

export type VerificationStage =
  | 'PENDING'
  | 'TXT_VERIFIED'
  | 'MX_VERIFIED'
  | 'SPF_VERIFIED'
  | 'DKIM_VERIFIED'
  | 'DMARC_VERIFIED'
  | 'FULLY_VERIFIED'
  | 'FAILED';

export interface DnsRecordStatus {
  valid: boolean;
  expected: string;
  actual?: string | string[] | null;
  error?: string | null;
}

export interface DnsCheckResults {
  ownershipTxt: DnsRecordStatus;
  mx: DnsRecordStatus;
  spf: DnsRecordStatus;
  dkim: DnsRecordStatus;
  dmarc: DnsRecordStatus;
}

export interface CustomDomain {
  id: string;
  orgId: string;
  domain: string;
  verificationToken: string;
  verificationStatus: VerificationStage;
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

export function calculateVerificationStage(checks: DnsCheckResults): VerificationStage {
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

export class DnsPollerService {
  private readonly domains = new Map<string, CustomDomain>();
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
    const tokenValue = `quant-verify=${verificationToken}`;

    return {
      domain: normalizedDomain,
      verificationToken,
      records: [
        {
          type: 'TXT',
          name: normalizedDomain,
          value: tokenValue,
          description: 'Domain ownership verification token',
        },
        {
          type: 'MX',
          name: normalizedDomain,
          value: 'mail.quantmail.in',
          priority: 10,
          description: 'Inbound mail exchange server',
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
          description: 'DKIM 2048-bit cryptographic key pointer',
        },
        {
          type: 'TXT',
          name: `_dmarc.${normalizedDomain}`,
          value: 'v=DMARC1; p=reject; rua=mailto:dmarc-reports@quantmail.in',
          description: 'DMARC policy enforcement record',
        },
      ],
    };
  }

  registerDomain(
    orgId: string,
    rawDomain: string,
  ): { domain: CustomDomain; instructions: DnsInstructions } {
    const domain = rawDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!domain || !domain.includes('.') || domain.length < 3) {
      throw createAppError('Invalid domain format', 400, 'INVALID_DOMAIN');
    }

    // Check if domain is already registered
    const existing = Array.from(this.domains.values()).find((d) => d.domain === domain);
    if (existing) {
      if (existing.orgId !== orgId) {
        throw createAppError(
          'Domain already registered by another organization',
          409,
          'DOMAIN_CONFLICT',
        );
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
      ownershipTxt: { valid: false, expected: `quant-verify=${verificationToken}`, actual: null },
      mx: { valid: false, expected: 'mail.quantmail.in', actual: null },
      spf: { valid: false, expected: 'include:_spf.quantmail.in', actual: null },
      dkim: { valid: false, expected: 'quantmail._domainkey.quantmail.in', actual: null },
      dmarc: { valid: false, expected: 'v=DMARC1; p=reject', actual: null },
    };

    const customDomain: CustomDomain = {
      id,
      orgId,
      domain,
      verificationToken,
      verificationStatus: 'PENDING',
      dnsChecks: emptyChecks,
      createdAt: now,
      updatedAt: now,
    };

    this.domains.set(id, customDomain);
    const instructions = this.getInstructions(domain, verificationToken);

    return { domain: customDomain, instructions };
  }

  getDomain(id: string): CustomDomain | undefined {
    return this.domains.get(id);
  }

  listDomains(orgId?: string): CustomDomain[] {
    const list = Array.from(this.domains.values());
    if (orgId) {
      return list.filter((d) => d.orgId === orgId);
    }
    return list;
  }

  deleteDomain(id: string, orgId?: string): boolean {
    const domain = this.domains.get(id);
    if (!domain) {
      return false;
    }
    if (orgId && domain.orgId !== orgId) {
      throw createAppError('Forbidden: domain belongs to another organization', 403, 'FORBIDDEN');
    }
    return this.domains.delete(id);
  }

  async checkOwnershipTxt(domain: string, token: string): Promise<DnsRecordStatus> {
    const expected = `quant-verify=${token}`;
    try {
      let txtRecords: string[][] = [];
      try {
        txtRecords = await this.resolver.resolveTxt(domain);
      } catch (err: any) {
        if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
          // ignore to try subdomain
        }
      }

      if (!txtRecords.length) {
        try {
          txtRecords = await this.resolver.resolveTxt(`_quant-verify.${domain}`);
        } catch {
          // ignore
        }
      }

      const flatRecords = txtRecords.map((chunks) => chunks.join(''));
      const matched = flatRecords.find(
        (r) => r.trim() === expected || r.includes(expected) || r.trim() === token,
      );

      if (matched) {
        return { valid: true, expected, actual: matched };
      }
      return {
        valid: false,
        expected,
        actual: flatRecords.length > 0 ? flatRecords : null,
        error: `TXT record '${expected}' not found`,
      };
    } catch (err: any) {
      return { valid: false, expected, actual: null, error: err.message || 'DNS query failed' };
    }
  }

  async checkMx(domain: string): Promise<DnsRecordStatus> {
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

  async checkSpf(domain: string): Promise<DnsRecordStatus> {
    const expected = 'include:_spf.quantmail.in';
    try {
      const txtRecords = await this.resolver.resolveTxt(domain);
      const flatRecords = txtRecords.map((chunks) => chunks.join(''));
      const spfRecord = flatRecords.find((r) => {
        const lower = r.toLowerCase();
        return lower.startsWith('v=spf1') && lower.includes(expected.toLowerCase());
      });

      if (spfRecord) {
        return { valid: true, expected, actual: spfRecord };
      }
      return {
        valid: false,
        expected,
        actual: flatRecords.filter((r) => r.toLowerCase().startsWith('v=spf1')),
        error: `SPF record with '${expected}' not found`,
      };
    } catch (err: any) {
      return { valid: false, expected, actual: null, error: err.message || 'DNS query failed' };
    }
  }

  async checkDkim(domain: string): Promise<DnsRecordStatus> {
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

  async checkDmarc(domain: string): Promise<DnsRecordStatus> {
    const expected = 'v=DMARC1; p=reject';
    const dmarcDomain = `_dmarc.${domain}`;
    try {
      const txtRecords = await this.resolver.resolveTxt(dmarcDomain);
      const flatRecords = txtRecords.map((chunks) => chunks.join(''));
      const dmarcRecord = flatRecords.find((r) => {
        const lower = r.toLowerCase();
        return lower.includes('v=dmarc1') && lower.includes('p=reject');
      });

      if (dmarcRecord) {
        return { valid: true, expected, actual: dmarcRecord };
      }
      return {
        valid: false,
        expected,
        actual: flatRecords.filter((r) => r.toLowerCase().includes('v=dmarc1')),
        error: `DMARC record with '${expected}' not found at ${dmarcDomain}`,
      };
    } catch (err: any) {
      return { valid: false, expected, actual: null, error: err.message || 'DNS query failed' };
    }
  }

  async verifyDomain(id: string): Promise<CustomDomain> {
    const domain = this.domains.get(id);
    if (!domain) {
      throw createAppError('Domain not found', 404, 'DOMAIN_NOT_FOUND');
    }

    const [ownershipTxt, mx, spf, dkim, dmarc] = await Promise.all([
      this.checkOwnershipTxt(domain.domain, domain.verificationToken),
      this.checkMx(domain.domain),
      this.checkSpf(domain.domain),
      this.checkDkim(domain.domain),
      this.checkDmarc(domain.domain),
    ]);

    const dnsChecks: DnsCheckResults = {
      ownershipTxt,
      mx,
      spf,
      dkim,
      dmarc,
    };

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

  async pollAllPending(): Promise<CustomDomain[]> {
    const pending = Array.from(this.domains.values()).filter(
      (d) => d.verificationStatus !== 'FULLY_VERIFIED',
    );
    const results: CustomDomain[] = [];
    for (const domain of pending) {
      const updated = await this.verifyDomain(domain.id);
      results.push(updated);
    }
    return results;
  }

  startPoller(intervalMs: number = 60000): void {
    if (this.pollerTimer) return;
    this.pollerTimer = setInterval(() => {
      this.pollAllPending().catch(() => {
        // Poller errors logged or suppressed
      });
    }, intervalMs);
  }

  stopPoller(): void {
    if (this.pollerTimer) {
      clearInterval(this.pollerTimer);
      this.pollerTimer = undefined;
    }
  }

  clearStore(): void {
    this.domains.clear();
    this.stopPoller();
  }
}

export const defaultDnsPollerService = new DnsPollerService();
