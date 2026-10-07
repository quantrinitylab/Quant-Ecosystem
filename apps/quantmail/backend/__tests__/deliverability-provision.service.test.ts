// @vitest-environment node
// ============================================================================
// QuantMail — DKIM provisioning round-trip (sign -> verify)
// ============================================================================
//
// Proves the outbound mail-auth path end to end WITHOUT a network: provision a
// domain's DKIM keypair, sign a message with the provisioned private key, then
// verify that signature through the service's own inbound DKIM verifier using
// the provisioned PUBLIC key as the DNS-published record. A receiver doing the
// same DNS lookup would therefore accept QuantMail's mail.

import { describe, it, expect } from 'vitest';
import {
  DeliverabilityAuthService,
  type DnsResolverPort,
} from '../services/deliverability-auth.service';
import { InboundIngestAdapter } from '../services/inbound-ingest.service';

interface DomainAuthRow {
  domain: string;
  dkimSelector: string;
  publicKey: string;
  privateKeyRef: string;
  spfRecord: string | null;
  dmarcPolicy: string | null;
}

/** Minimal in-memory `domainAuthKey` delegate (findUnique + upsert). */
function createPrismaMock() {
  const rows = new Map<string, DomainAuthRow>();
  return {
    domainAuthKey: {
      findUnique: async ({ where }: { where: { domain: string } }) =>
        rows.get(where.domain) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { domain: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = rows.get(where.domain);
        const next = (existing ? { ...existing, ...update } : { ...create }) as DomainAuthRow;
        rows.set(where.domain, next);
        return next;
      },
    },
  };
}

/** Fake DNS that serves the provisioned DKIM public key at its _domainkey host. */
function createFakeDns(dkimHost: string, publicKeyDerB64: string): DnsResolverPort {
  return {
    async resolveTxt(hostname: string): Promise<string[][]> {
      if (hostname === dkimHost) {
        return [[`v=DKIM1; k=rsa; p=${publicKeyDerB64}`]];
      }
      throw new Error(`NXDOMAIN ${hostname}`);
    },
    async resolveMx() {
      return [];
    },
    async resolve4() {
      return [];
    },
    async resolve6() {
      return [];
    },
  };
}

const HEADERS = {
  from: 'alice@example.com',
  to: 'bob@dest.example',
  subject: 'Quarterly update',
  date: 'Tue, 20 Jun 2026 10:00:00 +0000',
  'message-id': '<msg-1@example.com>',
};
const BODY = 'Hello Bob,\r\nHere is the update.\r\n';

describe('DeliverabilityAuthService.provisionDomainKey', () => {
  it('returns well-formed DKIM/SPF/DMARC DNS records', async () => {
    const service = new DeliverabilityAuthService(createPrismaMock() as never);
    const result = await service.provisionDomainKey('Example.com', { selector: 'qm2026' });

    expect(result.domain).toBe('example.com');
    expect(result.selector).toBe('qm2026');
    expect(result.publicKey.length).toBeGreaterThan(0);
    expect(result.dnsRecords.dkim.host).toBe('qm2026._domainkey.example.com');
    expect(result.dnsRecords.dkim.value).toBe(`v=DKIM1; k=rsa; p=${result.publicKey}`);
    expect(result.dnsRecords.spf.value).toContain('v=spf1');
    expect(result.dnsRecords.dmarc.host).toBe('_dmarc.example.com');
    expect(result.dnsRecords.dmarc.value).toContain('v=DMARC1');
  });

  it('signs mail that verifies against the provisioned (DNS-published) key', async () => {
    const prisma = createPrismaMock();
    // 1) Provision the domain's key.
    const provisionService = new DeliverabilityAuthService(prisma as never);
    const provisioned = await provisionService.provisionDomainKey('example.com', {
      selector: 'qm2026',
    });

    // 2) Sign a message with the provisioned private key (resolved from the vault).
    const signer = await provisionService.getDkimSigner('example.com');
    const dkimSignature = signer.sign(HEADERS, BODY);
    expect(dkimSignature).toContain('d=example.com');
    expect(dkimSignature).toContain('s=qm2026');
    expect(/(^|;)\s*b=[A-Za-z0-9+/=]+/.test(dkimSignature)).toBe(true);

    // 3) Verify it through the inbound verifier, with the provisioned PUBLIC key
    //    served as the DNS record a receiver would fetch.
    const verifyService = new DeliverabilityAuthService(prisma as never, {
      dns: createFakeDns('qm2026._domainkey.example.com', provisioned.publicKey),
    });
    const verdict = await verifyService.verifyInbound({
      headerFrom: HEADERS.from,
      headers: { ...HEADERS, 'dkim-signature': dkimSignature },
      rawBody: BODY,
    });

    expect(verdict.dkim).toBe('pass');
    expect(verdict.details.dkimDomain).toBe('example.com');
    expect(verdict.details.dkimAligned).toBe(true);
  });

  it('fails verification when the signed body is tampered with', async () => {
    const prisma = createPrismaMock();
    const service = new DeliverabilityAuthService(prisma as never);
    const provisioned = await service.provisionDomainKey('example.com', { selector: 'qm2026' });
    const signer = await service.getDkimSigner('example.com');
    const dkimSignature = signer.sign(HEADERS, BODY);

    const verifyService = new DeliverabilityAuthService(prisma as never, {
      dns: createFakeDns('qm2026._domainkey.example.com', provisioned.publicKey),
    });
    const verdict = await verifyService.verifyInbound({
      headerFrom: HEADERS.from,
      headers: { ...HEADERS, 'dkim-signature': dkimSignature },
      rawBody: `${BODY}TAMPERED`,
    });

    expect(verdict.dkim).toBe('fail');
  });

  describe('DeliverabilityAuthService.evaluateArc (Task M29 RFC 8617)', () => {
    it('returns none when message has no ARC headers', async () => {
      const service = new DeliverabilityAuthService(createPrismaMock() as never);
      const result = await service.evaluateArc({
        headerFrom: 'alice@example.com',
        headers: { from: 'alice@example.com', to: 'bob@quantmail.in' },
        rawBody: 'Hello',
      });

      expect(result.result).toBe('none');
      expect(result.chainStatus).toBe('none');
      expect(result.hops).toBe(0);
    });

    it('validates a single-hop ARC set where hop 1 has cv=none and dkim=pass', async () => {
      const service = new DeliverabilityAuthService(createPrismaMock() as never);
      const result = await service.evaluateArc({
        headerFrom: 'alice@example.com',
        headers: {
          'arc-seal': 'i=1; a=rsa-sha256; cv=none; d=forwarder.org; s=arc1; b=fakeSig==',
          'arc-message-signature':
            'i=1; a=rsa-sha256; d=forwarder.org; s=arc1; bh=bodyHash==; b=sig==',
          'arc-authentication-results':
            'i=1; mx.forwarder.org; dkim=pass header.i=@example.com; spf=pass smtp.mailfrom=alice@example.com',
        },
        rawBody: 'Hello',
      });

      expect(result.result).toBe('pass');
      expect(result.chainStatus).toBe('pass');
      expect(result.hops).toBe(1);
      expect(result.oldestAuthResults).toContain('dkim=pass');
    });

    it('validates a multi-hop ARC chain where hop 1 has cv=none and hop 2 has cv=pass', async () => {
      const service = new DeliverabilityAuthService(createPrismaMock() as never);
      const result = await service.evaluateArc({
        headerFrom: 'alice@example.com',
        headers: {
          'arc-seal': [
            'i=1; a=rsa-sha256; cv=none; d=forwarder.org; s=arc1; b=sig1==',
            'i=2; a=rsa-sha256; cv=pass; d=mailgroup.org; s=arc2; b=sig2==',
          ].join('\n'),
          'arc-message-signature': [
            'i=1; a=rsa-sha256; d=forwarder.org; s=arc1; bh=bh1==; b=msig1==',
            'i=2; a=rsa-sha256; d=mailgroup.org; s=arc2; bh=bh2==; b=msig2==',
          ].join('\n'),
          'arc-authentication-results': [
            'i=1; mx.forwarder.org; dkim=pass header.i=@example.com; spf=pass',
            'i=2; mx.mailgroup.org; arc=pass (as.1=pass ams.1=pass)',
          ].join('\n'),
        },
        rawBody: 'Hello',
      });

      expect(result.result).toBe('pass');
      expect(result.chainStatus).toBe('pass');
      expect(result.hops).toBe(2);
    });

    it('fails when intermediate hop has broken chain (hop 2 cv != pass)', async () => {
      const service = new DeliverabilityAuthService(createPrismaMock() as never);
      const result = await service.evaluateArc({
        headerFrom: 'alice@example.com',
        headers: {
          'arc-seal': [
            'i=1; a=rsa-sha256; cv=none; d=forwarder.org; s=arc1; b=sig1==',
            'i=2; a=rsa-sha256; cv=fail; d=mailgroup.org; s=arc2; b=sig2==',
          ].join('\n'),
          'arc-message-signature': [
            'i=1; a=rsa-sha256; d=forwarder.org; s=arc1; bh=bh1==; b=msig1==',
            'i=2; a=rsa-sha256; d=mailgroup.org; s=arc2; bh=bh2==; b=msig2==',
          ].join('\n'),
          'arc-authentication-results': [
            'i=1; mx.forwarder.org; dkim=pass header.i=@example.com',
            'i=2; mx.mailgroup.org; arc=fail',
          ].join('\n'),
        },
        rawBody: 'Hello',
      });

      expect(result.result).toBe('fail');
      expect(result.chainStatus).toBe('fail');
    });

    it('rescues forwarded mail in verifyInbound and prevents quarantine via InboundIngestAdapter.shouldQuarantine', async () => {
      const service = new DeliverabilityAuthService(createPrismaMock() as never);
      const verdict = await service.verifyInbound({
        headerFrom: 'alice@forwarded-list.com',
        headers: {
          from: 'alice@forwarded-list.com',
          to: 'bob@quantmail.in',
          'arc-seal': 'i=1; a=rsa-sha256; cv=none; d=relay.net; s=arc; b=sig==',
          'arc-message-signature': 'i=1; a=rsa-sha256; d=relay.net; s=arc; bh=b==; b=s==',
          'arc-authentication-results':
            'i=1; relay.net; dkim=pass header.i=@forwarded-list.com; spf=pass',
        },
        rawBody: 'Forwarded message body',
      });

      expect(verdict.arc).toBe('pass');
      expect(verdict.aligned).toBe(true);
      expect(verdict.details.arcAligned).toBe(true);
      expect(verdict.details.arcChain?.hops).toBe(1);

      // Verified: legitimate forwarded mail is NOT quarantined
      expect(InboundIngestAdapter.shouldQuarantine(verdict)).toBe(false);
    });
  });
});
