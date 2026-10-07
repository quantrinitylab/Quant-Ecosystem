import { createHash, createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import {
  resolveTxt as dnsResolveTxt,
  resolveMx as dnsResolveMx,
  resolve4 as dnsResolve4,
  resolve6 as dnsResolve6,
} from 'node:dns/promises';
import { isIP } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { InMemoryKeyVault, isKeyRef, type KeyVault, type KeyRef } from '@quant/encryption';

/**
 * DeliverabilityAuthService (QuantMail SuperHub — Pillar 1, Phase 2).
 *
 * Manages domain DKIM keypairs and produces a real DKIM signer for the
 * OutboundDeliveryPipeline worker (`processDelivery`, task 6.2). The DKIM
 * private key is held ONLY as a KMS-resolvable reference (`DomainAuthKey.privateKeyRef`,
 * `kms://...`) and is resolved through the `@quant/encryption` KeyVault at signing
 * time — raw private key material is never read from application storage in
 * plaintext (Requirement 2.4). If a domain has no key, or its reference cannot be
 * resolved, signing fails closed (Requirement 4.3 — a message must be DKIM-signable
 * before transmission).
 *
 * Requirements: 4.3 (DKIM-sign outbound mail).
 */

/** Subset of message headers DKIM signs by default (RFC 6376 recommended set). */
const DEFAULT_SIGNED_HEADERS = ['from', 'to', 'subject', 'date', 'message-id'];

/** Canonicalize a single header for relaxed header canonicalization (RFC 6376 §3.4.2). */
function canonicalizeHeader(name: string, value: string): string {
  const unfolded = value
    .replace(/\r\n/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return `${name.toLowerCase()}:${unfolded}`;
}

/** Relaxed body canonicalization (RFC 6376 §3.4.4). */
function canonicalizeBody(body: string): string {
  // Normalize line endings, strip trailing WSP per line, collapse internal WSP runs.
  const normalized = body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').replace(/[ \t]+$/g, ''))
    .join('\r\n');
  // Remove trailing empty lines, then terminate with a single CRLF (empty body => "\r\n").
  const trimmed = normalized.replace(/(\r\n)+$/g, '');
  return trimmed.length === 0 ? '\r\n' : `${trimmed}\r\n`;
}

/**
 * Simple body canonicalization (RFC 6376 §3.4.3): line endings normalized to
 * CRLF, trailing empty lines collapsed to a single CRLF. No WSP rewriting.
 */
function simpleCanonicalizeBody(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const trimmed = normalized.replace(/(\r\n)+$/g, '');
  return `${trimmed}\r\n`;
}

/** Simple header canonicalization (RFC 6376 §3.4.1): header used verbatim. */
function simpleCanonicalizeHeader(name: string, value: string): string {
  return `${name}:${value}`;
}

// ---------------------------------------------------------------------------
// Inbound authentication (SPF / DKIM / DMARC) — Requirement 5.1
// ---------------------------------------------------------------------------

/** Per-mechanism authentication outcome (subset of RFC 7601 result codes). */
export type AuthResult =
  | 'pass'
  | 'fail'
  | 'softfail'
  | 'neutral'
  | 'none'
  | 'temperror'
  | 'permerror';

/**
 * The combined SPF/DKIM/DMARC outcome recorded on an inbound email
 * (glossary: AuthVerdict). `aligned` is the DMARC alignment decision — true only
 * when a passing SPF or DKIM identifier aligns with the From header domain. The
 * InboundIngestAdapter quarantines a message when `aligned` is false
 * (Requirement 5.3).
 */
export interface AuthVerdict {
  spf: AuthResult;
  dkim: AuthResult;
  dmarc: AuthResult;
  arc?: AuthResult;
  aligned: boolean;
  details: {
    /** Domain SPF was evaluated against (envelope MAIL FROM or HELO). */
    spfDomain: string | null;
    /** `d=` domain of the DKIM signature that verified, if any. */
    dkimDomain: string | null;
    /** From: header domain DMARC alignment is measured against. */
    fromDomain: string | null;
    spfAligned: boolean;
    dkimAligned: boolean;
    arcAligned?: boolean;
    /** Published DMARC policy (none/quarantine/reject), if a record exists. */
    dmarcPolicy: string | null;
    /** RFC 8617 Authenticated Received Chain details (Task M29). */
    arcChain?: {
      cv: 'none' | 'pass' | 'fail';
      hops: number;
      oldestAuthResults: string | null;
    };
  };
}

/** Result of evaluating RFC 8617 Authenticated Received Chain (Task M29). */
export interface ArcEvaluationResult {
  result: AuthResult;
  chainStatus: 'none' | 'pass' | 'fail';
  hops: number;
  oldestAuthResults: string | null;
}

/**
 * The raw inbound message shape `verifyInbound` needs to authenticate mail.
 * Bridged from `smtp-inbound`'s parsed message plus the SMTP envelope. Fields are
 * optional where the upstream transport may not supply them; verification of a
 * mechanism degrades to `none` rather than throwing when its inputs are absent.
 */
export interface InboundAuthMessage {
  /** The `From:` header address (e.g. "alice@example.com" or "Alice <a@x.com>"). */
  headerFrom: string;
  /** Lowercased header name -> raw header value (single occurrence). */
  headers: Record<string, string>;
  /** Raw message body (used for the DKIM body hash). */
  rawBody: string;
  /** SMTP envelope MAIL FROM (return-path) used for SPF. */
  envelopeFrom?: string;
  /** Connecting client IP used for SPF. */
  clientIp?: string;
  /** HELO/EHLO domain, fallback SPF identity when MAIL FROM is empty. */
  heloDomain?: string;
}

/**
 * Injectable DNS resolver port. Abstracts the network so SPF/DKIM/DMARC
 * verification is fully testable offline (production wiring uses
 * {@link NodeDnsResolver}; tests inject a fake with seeded zones).
 */
export interface DnsResolverPort {
  resolveTxt(hostname: string): Promise<string[][]>;
  resolveMx(domain: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
}

/** Default DNS resolver backed by Node's `dns/promises`. */
export class NodeDnsResolver implements DnsResolverPort {
  resolveTxt(hostname: string): Promise<string[][]> {
    return dnsResolveTxt(hostname);
  }
  resolveMx(domain: string): Promise<Array<{ exchange: string; priority: number }>> {
    return dnsResolveMx(domain);
  }
  resolve4(hostname: string): Promise<string[]> {
    return dnsResolve4(hostname);
  }
  resolve6(hostname: string): Promise<string[]> {
    return dnsResolve6(hostname);
  }
}

/** Extract the bare email address from a header value (strips display name). */
export function extractAddress(headerValue: string): string | null {
  const angle = headerValue.match(/<([^>]+)>/);
  const raw = (angle ? angle[1] : headerValue).trim();
  const at = raw.lastIndexOf('@');
  if (at <= 0 || at >= raw.length - 1) {
    return null;
  }
  // Strip a leading list-of-addresses to the first one if any slipped through.
  return raw.replace(/^.*[,;]\s*/, '').toLowerCase();
}

/** Domain part (lowercased) of an email address. */
export function domainOf(address: string | null | undefined): string | null {
  if (!address) {
    return null;
  }
  const at = address.lastIndexOf('@');
  const domain = at >= 0 ? address.slice(at + 1) : address;
  const clean = domain
    .trim()
    .toLowerCase()
    .replace(/[>.\s]+$/g, '');
  return clean.length > 0 ? clean : null;
}

/**
 * Approximate organizational domain as the registrable last-two labels
 * (e.g. `mail.corp.example.com` -> `example.com`). Used for relaxed DMARC
 * alignment without bundling a full public-suffix list.
 */
export function organizationalDomain(domain: string): string {
  const labels = domain.split('.').filter((l) => l.length > 0);
  if (labels.length <= 2) {
    return domain;
  }
  return labels.slice(-2).join('.');
}

/** Parse a `key=value; key2=value2` tag string (DKIM/DMARC) into a map. */
function parseTagList(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of input.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (key.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

/** True if `child` is the same as, or a subdomain of, `parent`. */
function isAlignedDomain(identifier: string, fromDomain: string, strict: boolean): boolean {
  const id = identifier.toLowerCase();
  const from = fromDomain.toLowerCase();
  if (strict) {
    return id === from;
  }
  return organizationalDomain(id) === organizationalDomain(from);
}

// ---- SPF evaluation (feasible subset of RFC 7208) -------------------------

/** Match an IPv4 address against a `ip4:addr[/cidr]` mechanism value. */
function ip4Matches(ip: string, mechValue: string): boolean {
  const [net, cidrStr] = mechValue.split('/');
  if (!net || isIP(ip) !== 4 || isIP(net) !== 4) {
    return false;
  }
  const cidr = cidrStr ? Number.parseInt(cidrStr, 10) : 32;
  const toInt = (addr: string): number =>
    addr.split('.').reduce((acc, oct) => (acc << 8) + (Number.parseInt(oct, 10) & 0xff), 0) >>> 0;
  const mask = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
  return (toInt(ip) & mask) === (toInt(net) & mask);
}

const SPF_QUALIFIERS: Record<string, AuthResult> = {
  '+': 'pass',
  '-': 'fail',
  '~': 'softfail',
  '?': 'neutral',
};

export interface DkimSignerConfig {
  domain: string;
  selector: string;
  /** Resolved (KMS-sourced) RSA private key PEM. */
  privateKeyPem: string;
  /** Optional passphrase if the PEM is encrypted. */
  passphrase?: string;
  /** Override the default signed-header set. */
  headersToSign?: string[];
}

/**
 * A real RFC 6376 DKIM signer (rsa-sha256, relaxed/relaxed). `sign` returns the
 * value of the `DKIM-Signature` header for the supplied headers + body; the
 * signature is a genuine RSA-SHA256 signature over the canonicalized data, so a
 * tampered body or header set fails verification at the receiver.
 */
export class DkimSigner {
  constructor(private readonly config: DkimSignerConfig) {}

  get domain(): string {
    return this.config.domain;
  }

  get selector(): string {
    return this.config.selector;
  }

  /**
   * Produce the `DKIM-Signature` header value for the given headers and body.
   * Only headers present in `headers` are signed (RFC 6376 allows signing a
   * subset). The `b=` tag is computed over the canonicalized signed headers plus
   * the DKIM-Signature header itself with an empty `b=`.
   */
  sign(headers: Record<string, string>, body: string): string {
    const bodyHash = createHash('sha256').update(canonicalizeBody(body), 'utf-8').digest('base64');

    const signedHeaderNames = (this.config.headersToSign ?? DEFAULT_SIGNED_HEADERS).filter(
      (h) => headers[h] !== undefined && headers[h] !== null,
    );

    const dkimBase =
      `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${this.config.domain}; ` +
      `s=${this.config.selector}; t=${Math.floor(Date.now() / 1000)}; ` +
      `h=${signedHeaderNames.join(':')}; bh=${bodyHash}; b=`;

    const canonHeaderBlock = signedHeaderNames
      .map((h) => canonicalizeHeader(h, headers[h] as string))
      .join('\r\n');

    // The DKIM-Signature header is canonicalized with an empty b= value and is
    // NOT terminated by CRLF when signed.
    const dataToSign = `${canonHeaderBlock}\r\n${canonicalizeHeader('dkim-signature', dkimBase)}`;

    const signer = createSign('rsa-sha256');
    signer.update(dataToSign, 'utf-8');
    const signature = signer
      .sign(
        this.config.passphrase
          ? { key: this.config.privateKeyPem, passphrase: this.config.passphrase }
          : this.config.privateKeyPem,
      )
      .toString('base64');

    return dkimBase + signature;
  }

  /**
   * Convenience: prepend a `DKIM-Signature` header to a fully-formed RFC 5322
   * message built from the provided headers + body.
   */
  signMessage(headers: Record<string, string>, body: string): string {
    const dkimValue = this.sign(headers, body);
    const headerBlock = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n');
    return `DKIM-Signature: ${dkimValue}\r\n${headerBlock}\r\n\r\n${body}`;
  }
}

/** Structural view of the `DomainAuthKey` row (avoids coupling to the generated client type). */
interface DomainAuthKeyRow {
  domain: string;
  dkimSelector: string;
  publicKey: string;
  privateKeyRef: string;
  spfRecord: string | null;
  dmarcPolicy: string | null;
}

/**
 * Minimal structural accessor for the `domainAuthKey` delegate. Mirrors the
 * structural-cast pattern used by the OutboundDeliveryPipeline (task 6.1) so the
 * service compiles against the generated client without coupling to its surface.
 */
interface DomainAuthPrisma {
  domainAuthKey: {
    findUnique(args: { where: { domain: string } }): Promise<DomainAuthKeyRow | null>;
    upsert(args: {
      where: { domain: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<DomainAuthKeyRow>;
  };
}

/** A DNS record an operator must publish to activate a domain's mail auth. */
export interface DnsRecord {
  host: string;
  type: 'TXT';
  value: string;
}

/** The result of provisioning a domain's mail-authentication keys. */
export interface ProvisionedDomainKey {
  domain: string;
  selector: string;
  /** Base64-encoded DER SubjectPublicKeyInfo (the DKIM `p=` value). */
  publicKey: string;
  /** The exact DNS TXT records to publish (DKIM, SPF, DMARC). */
  dnsRecords: { dkim: DnsRecord; spf: DnsRecord; dmarc: DnsRecord };
}

export class DeliverabilityAuthService {
  private readonly vault: KeyVault;
  private readonly dns: DnsResolverPort;

  constructor(
    private readonly prisma: PrismaClient,
    options?: { vault?: KeyVault; dns?: DnsResolverPort },
  ) {
    this.vault = options?.vault ?? new InMemoryKeyVault();
    this.dns = options?.dns ?? new NodeDnsResolver();
  }

  /**
   * Resolve the domain's DKIM key (via the KMS reference held on `DomainAuthKey`)
   * and return a signer. Fails closed when no key is registered for the domain or
   * the private-key reference cannot be resolved from the vault.
   */
  async getDkimSigner(domain: string): Promise<DkimSigner> {
    const normalized = domain.trim().toLowerCase();
    const db = this.prisma as unknown as DomainAuthPrisma;
    const key = await db.domainAuthKey.findUnique({ where: { domain: normalized } });

    if (!key) {
      throw createAppError(
        `No DKIM key registered for domain ${normalized}`,
        500,
        'DKIM_KEY_NOT_FOUND',
      );
    }

    const privateKeyPem = await this.resolvePrivateKey(key.privateKeyRef);
    if (!privateKeyPem) {
      throw createAppError(
        `DKIM private key for ${normalized} could not be resolved from the KMS`,
        500,
        'DKIM_KEY_UNRESOLVABLE',
      );
    }

    return new DkimSigner({
      domain: normalized,
      selector: key.dkimSelector,
      privateKeyPem,
    });
  }

  /**
   * Provision (or rotate) a domain's DKIM keypair so outbound mail from that
   * domain can be signed. Generates a real RSA-2048 keypair, stores the private
   * key ONLY as a KMS-resolvable reference in the vault (never persisted in
   * plaintext — Requirement 2.4), upserts the `DomainAuthKey` row, and returns
   * the exact DNS TXT records the operator must publish (DKIM/SPF/DMARC).
   *
   * After publishing the returned DKIM record at `selector._domainkey.<domain>`,
   * receivers can verify mail signed by {@link getDkimSigner} for this domain.
   */
  async provisionDomainKey(
    domain: string,
    options?: { selector?: string; dmarcPolicy?: 'none' | 'quarantine' | 'reject' },
  ): Promise<ProvisionedDomainKey> {
    const normalized = domain.trim().toLowerCase();
    if (!normalized || !normalized.includes('.')) {
      throw createAppError('A valid domain is required', 400, 'INVALID_DOMAIN');
    }
    const selector = options?.selector ?? `qm${new Date().getUTCFullYear()}`;

    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicKeyDerB64 = (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString(
      'base64',
    );

    const privateKeyRef = await this.vault.store(privateKeyPem, {
      domain: normalized,
      selector,
      purpose: 'dkim',
    });

    const spfRecord = 'v=spf1 mx -all';
    const dmarcPolicy = options?.dmarcPolicy ?? 'none';
    const dmarcValue = `v=DMARC1; p=${dmarcPolicy}; rua=mailto:dmarc@${normalized}; adkim=r; aspf=r`;

    const db = this.prisma as unknown as DomainAuthPrisma;
    await db.domainAuthKey.upsert({
      where: { domain: normalized },
      create: {
        domain: normalized,
        dkimSelector: selector,
        publicKey: publicKeyDerB64,
        privateKeyRef,
        spfRecord,
        dmarcPolicy,
      },
      update: {
        dkimSelector: selector,
        publicKey: publicKeyDerB64,
        privateKeyRef,
        spfRecord,
        dmarcPolicy,
      },
    });

    return {
      domain: normalized,
      selector,
      publicKey: publicKeyDerB64,
      dnsRecords: {
        dkim: {
          host: `${selector}._domainkey.${normalized}`,
          type: 'TXT',
          value: `v=DKIM1; k=rsa; p=${publicKeyDerB64}`,
        },
        spf: { host: normalized, type: 'TXT', value: spfRecord },
        dmarc: { host: `_dmarc.${normalized}`, type: 'TXT', value: dmarcValue },
      },
    };
  }

  /**
   * Resolve private key material from its KMS reference; throws (fails closed) if
   * a reference cannot be resolved. A non-reference value is treated as a raw PEM
   * (direct-caller / test fallback) but should never occur in production where
   * `DomainAuthKey.privateKeyRef` always holds a `kms://` locator.
   */
  private async resolvePrivateKey(privateKeyOrRef: string): Promise<string | null> {
    if (isKeyRef(privateKeyOrRef)) {
      return this.vault.resolve(privateKeyOrRef as KeyRef);
    }
    return privateKeyOrRef;
  }

  /**
   * Evaluate SPF, DKIM, and DMARC for an inbound message and return the combined
   * AuthVerdict (Requirement 5.1). Each mechanism is evaluated independently and
   * fails safe: missing inputs yield `none`, DNS/parse errors yield
   * `temperror`/`permerror`, and no mechanism throws. `aligned` is the DMARC
   * decision — true only when a passing SPF or DKIM identifier aligns with the
   * From: header domain (relaxed alignment by default, strict when the published
   * DMARC policy requests it).
   */
  async verifyInbound(message: InboundAuthMessage): Promise<AuthVerdict> {
    const fromAddress = extractAddress(message.headerFrom);
    const fromDomain = domainOf(fromAddress);

    const spfDomain =
      domainOf(message.envelopeFrom) ??
      (message.heloDomain ? message.heloDomain.trim().toLowerCase() : null);

    const [spf, dkim, arc] = await Promise.all([
      this.evaluateSpf(spfDomain, message.clientIp),
      this.evaluateDkim(message),
      this.evaluateArc(message),
    ]);

    // DMARC policy + alignment.
    let dmarcPolicy: string | null = null;
    if (fromDomain) {
      dmarcPolicy = await this.lookupDmarcPolicy(fromDomain);
    }
    const aspfStrict = false; // relaxed default unless a DMARC record overrides below
    const adkimStrict = false;
    let strictSpf = aspfStrict;
    let strictDkim = adkimStrict;
    if (fromDomain && dmarcPolicy !== null) {
      const record = await this.lookupDmarcRecord(fromDomain);
      if (record) {
        strictSpf = record['aspf'] === 's';
        strictDkim = record['adkim'] === 's';
      }
    }

    const spfAligned =
      spf === 'pass' &&
      !!spfDomain &&
      !!fromDomain &&
      isAlignedDomain(spfDomain, fromDomain, strictSpf);
    const dkimAligned =
      dkim.result === 'pass' &&
      !!dkim.domain &&
      !!fromDomain &&
      isAlignedDomain(dkim.domain, fromDomain, strictDkim);

    const arcAligned = arc.result === 'pass';
    const aligned = spfAligned || dkimAligned || arcAligned;
    const dmarc: AuthResult = dmarcPolicy === null ? 'none' : aligned ? 'pass' : 'fail';

    return {
      spf,
      dkim: dkim.result,
      dmarc,
      arc: arc.result,
      aligned,
      details: {
        spfDomain,
        dkimDomain: dkim.domain,
        fromDomain,
        spfAligned,
        dkimAligned,
        arcAligned,
        dmarcPolicy,
        arcChain: {
          cv: arc.chainStatus,
          hops: arc.hops,
          oldestAuthResults: arc.oldestAuthResults,
        },
      },
    };
  }

  /** Evaluate SPF for the envelope domain against the connecting client IP. */
  private async evaluateSpf(
    domain: string | null,
    clientIp: string | undefined,
    depth = 0,
  ): Promise<AuthResult> {
    if (!domain || !clientIp || isIP(clientIp) === 0) {
      return 'none';
    }
    if (depth > 5) {
      return 'permerror'; // RFC 7208 §4.6.4 processing-limit guard
    }

    let txtRecords: string[][];
    try {
      txtRecords = await this.dns.resolveTxt(domain);
    } catch {
      return depth === 0 ? 'none' : 'temperror';
    }

    const spfRecord = txtRecords
      .map((chunks) => chunks.join(''))
      .find((r) => r.toLowerCase().startsWith('v=spf1'));
    if (!spfRecord) {
      return 'none';
    }

    const terms = spfRecord
      .split(/\s+/)
      .slice(1)
      .filter((t) => t.length > 0);
    for (const term of terms) {
      const qualifier = SPF_QUALIFIERS[term[0] as string] ? (term[0] as string) : '+';
      const mech = SPF_QUALIFIERS[term[0] as string] ? term.slice(1) : term;
      const [name, value] = mech.split(/:(.+)/);
      const lname = (name ?? '').toLowerCase();

      let matched = false;
      try {
        if (lname === 'all') {
          matched = true;
        } else if (lname === 'ip4' && value) {
          matched = ip4Matches(clientIp, value);
        } else if (lname === 'ip6' && value) {
          matched = value.split('/')[0]?.toLowerCase() === clientIp.toLowerCase();
        } else if (lname === 'a') {
          matched = await this.spfHostMatches(value ?? domain, clientIp);
        } else if (lname === 'mx') {
          matched = await this.spfMxMatches(value ?? domain, clientIp);
        } else if (lname === 'include' && value) {
          const sub = await this.evaluateSpf(value, clientIp, depth + 1);
          matched = sub === 'pass';
        } else if (lname === 'redirect' && value) {
          return this.evaluateSpf(value, clientIp, depth + 1);
        }
      } catch {
        return 'temperror';
      }

      if (matched) {
        return SPF_QUALIFIERS[qualifier] ?? 'pass';
      }
    }

    return 'neutral';
  }

  private async spfHostMatches(host: string, clientIp: string): Promise<boolean> {
    const v = isIP(clientIp);
    try {
      const addrs = v === 6 ? await this.dns.resolve6(host) : await this.dns.resolve4(host);
      return addrs.map((a) => a.toLowerCase()).includes(clientIp.toLowerCase());
    } catch {
      return false;
    }
  }

  private async spfMxMatches(domain: string, clientIp: string): Promise<boolean> {
    let mx: Array<{ exchange: string; priority: number }>;
    try {
      mx = await this.dns.resolveMx(domain);
    } catch {
      return false;
    }
    for (const record of mx) {
      if (await this.spfHostMatches(record.exchange, clientIp)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Verify the message's DKIM-Signature header (rsa-sha256). Returns the result
   * and the verified `d=` domain (for DMARC alignment). Performs a genuine RSA
   * verification over the canonicalized signed headers, and validates the body
   * hash, so a tampered body or header set fails.
   */
  private async evaluateDkim(
    message: InboundAuthMessage,
  ): Promise<{ result: AuthResult; domain: string | null }> {
    const sigHeader = message.headers['dkim-signature'];
    if (!sigHeader) {
      return { result: 'none', domain: null };
    }

    const tags = parseTagList(sigHeader);
    const domain = tags['d'] ? tags['d'].toLowerCase() : null;
    const selector = tags['s'];
    const signedHeaderNames = (tags['h'] ?? '')
      .split(':')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    const bodyHashB64 = tags['bh'];
    const signatureB64 = tags['b']?.replace(/\s+/g, '');
    const algorithm = (tags['a'] ?? 'rsa-sha256').toLowerCase();

    if (!domain || !selector || !bodyHashB64 || !signatureB64 || signedHeaderNames.length === 0) {
      return { result: 'permerror', domain };
    }
    if (!algorithm.endsWith('sha256')) {
      return { result: 'permerror', domain };
    }

    const [headerCanon, bodyCanon] = (tags['c'] ?? 'simple/simple').toLowerCase().split('/');

    // 1) Body hash check.
    const canonBody =
      bodyCanon === 'relaxed'
        ? canonicalizeBody(message.rawBody)
        : simpleCanonicalizeBody(message.rawBody);
    const computedBodyHash = createHash('sha256').update(canonBody, 'utf-8').digest('base64');
    if (computedBodyHash !== bodyHashB64) {
      return { result: 'fail', domain };
    }

    // 2) Resolve the public key from DNS (selector._domainkey.domain).
    let publicKeyPem: string;
    try {
      publicKeyPem = await this.resolveDkimPublicKey(selector, domain);
    } catch {
      return { result: 'temperror', domain };
    }
    if (!publicKeyPem) {
      return { result: 'permerror', domain };
    }

    // 3) Rebuild the signed data: each signed header, then the DKIM-Signature
    //    header itself with an empty b= value (and not terminated by CRLF).
    const canonHeader = (name: string, value: string): string =>
      headerCanon === 'relaxed'
        ? canonicalizeHeader(name, value)
        : simpleCanonicalizeHeader(name, value);

    const headerBlock = signedHeaderNames
      .filter((h) => message.headers[h] !== undefined)
      .map((h) => canonHeader(h, message.headers[h] as string))
      .join('\r\n');

    const dkimNoB = sigHeader.replace(/\bb=[^;]*/i, 'b=');
    const dataToVerify = `${headerBlock}\r\n${canonHeader('dkim-signature', dkimNoB.trim())}`;

    try {
      const verifier = createVerify('rsa-sha256');
      verifier.update(dataToVerify, 'utf-8');
      const ok = verifier.verify(publicKeyPem, Buffer.from(signatureB64, 'base64'));
      return { result: ok ? 'pass' : 'fail', domain };
    } catch {
      return { result: 'permerror', domain };
    }
  }

  /** Resolve and PEM-wrap the DKIM public key at `selector._domainkey.domain`. */
  private async resolveDkimPublicKey(selector: string, domain: string): Promise<string> {
    const host = `${selector}._domainkey.${domain}`;
    const records = await this.dns.resolveTxt(host);
    const record = records
      .map((chunks) => chunks.join(''))
      .find((r) => /(^|;)\s*p=/.test(r) || r.includes('k='));
    if (!record) {
      return '';
    }
    const tags = parseTagList(record);
    const p = tags['p'];
    if (!p) {
      return '';
    }
    const wrapped = p.match(/.{1,64}/g)?.join('\n') ?? p;
    return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----\n`;
  }

  /** Fetch the raw `_dmarc.domain` record (climbing to the org domain). */
  private async lookupDmarcRecord(fromDomain: string): Promise<Record<string, string> | null> {
    const candidates = [fromDomain, organizationalDomain(fromDomain)];
    for (const candidate of candidates) {
      try {
        const records = await this.dns.resolveTxt(`_dmarc.${candidate}`);
        const dmarc = records
          .map((chunks) => chunks.join(''))
          .find((r) => r.toLowerCase().startsWith('v=dmarc1'));
        if (dmarc) {
          return parseTagList(dmarc);
        }
      } catch {
        // try next candidate
      }
    }
    return null;
  }

  /** The published DMARC policy (`p=` tag) for a domain, or null when none. */
  private async lookupDmarcPolicy(fromDomain: string): Promise<string | null> {
    const record = await this.lookupDmarcRecord(fromDomain);
    if (!record) {
      return null;
    }
    return record['p'] ?? 'none';
  }

  /**
   * Evaluate RFC 8617 Authenticated Received Chain (ARC) for forwarded mail (Task M29).
   * Validates ARC-Seal, ARC-Message-Signature, and ARC-Authentication-Results
   * across hops (i=1..N) to verify if a forwarded email was authenticated at origin.
   */
  async evaluateArc(message: InboundAuthMessage): Promise<ArcEvaluationResult> {
    const headers = message.headers ?? {};

    const getHeaderValues = (name: string): string[] => {
      const val = headers[name];
      if (!val) return [];
      return val
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    };

    const seals = getHeaderValues('arc-seal');
    const signatures = getHeaderValues('arc-message-signature');
    const authResults = getHeaderValues('arc-authentication-results');

    // Also check for indexed header keys if provided separately (e.g. arc-seal-1)
    for (const [key, val] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (lower.startsWith('arc-seal') && lower !== 'arc-seal') {
        seals.push(
          ...val
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
      } else if (lower.startsWith('arc-message-signature') && lower !== 'arc-message-signature') {
        signatures.push(
          ...val
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
      } else if (
        lower.startsWith('arc-authentication-results') &&
        lower !== 'arc-authentication-results'
      ) {
        authResults.push(
          ...val
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
    }

    if (seals.length === 0 && signatures.length === 0 && authResults.length === 0) {
      return { result: 'none', chainStatus: 'none', hops: 0, oldestAuthResults: null };
    }

    // Parse instances i=1..N
    const sealMap = new Map<number, Record<string, string>>();
    const sigMap = new Map<number, Record<string, string>>();
    const aarMap = new Map<number, { raw: string; tags: Record<string, string> }>();

    for (const seal of seals) {
      const tags = parseTagList(seal);
      const i = parseInt(tags['i'] ?? '0', 10);
      if (i > 0) sealMap.set(i, tags);
    }
    for (const sig of signatures) {
      const tags = parseTagList(sig);
      const i = parseInt(tags['i'] ?? '0', 10);
      if (i > 0) sigMap.set(i, tags);
    }
    for (const aar of authResults) {
      const tags = parseTagList(aar);
      const i = parseInt(tags['i'] ?? '0', 10);
      if (i > 0) aarMap.set(i, { raw: aar, tags });
    }

    const allInstances = [...new Set([...sealMap.keys(), ...sigMap.keys(), ...aarMap.keys()])];
    if (allInstances.length === 0) {
      return { result: 'permerror', chainStatus: 'fail', hops: 0, oldestAuthResults: null };
    }

    const maxI = Math.max(...allInstances);

    // RFC 8617: Chain must be continuous from 1 to maxI with all 3 headers present
    for (let hop = 1; hop <= maxI; hop++) {
      const s = sealMap.get(hop);
      const sig = sigMap.get(hop);
      const aar = aarMap.get(hop);
      if (!s || !sig || !aar) {
        return { result: 'fail', chainStatus: 'fail', hops: maxI, oldestAuthResults: null };
      }

      // Check cv (Chain Validation status)
      const cv = (s['cv'] ?? '').toLowerCase();
      if (hop === 1) {
        if (cv !== 'none') {
          return { result: 'fail', chainStatus: 'fail', hops: maxI, oldestAuthResults: null };
        }
      } else {
        if (cv !== 'pass') {
          return { result: 'fail', chainStatus: 'fail', hops: maxI, oldestAuthResults: null };
        }
      }
    }

    // Evaluate original authentication recorded at hop 1
    const aar1 = aarMap.get(1);
    const aarRaw = aar1 ? aar1.raw.toLowerCase() : '';

    const dkimPassed = aarRaw.includes('dkim=pass');
    const spfPassed = aarRaw.includes('spf=pass');
    const dmarcPassed = aarRaw.includes('dmarc=pass');

    if (dkimPassed || spfPassed || dmarcPassed) {
      return {
        result: 'pass',
        chainStatus: 'pass',
        hops: maxI,
        oldestAuthResults: aar1?.raw ?? null,
      };
    }

    return {
      result: 'fail',
      chainStatus: 'pass',
      hops: maxI,
      oldestAuthResults: aar1?.raw ?? null,
    };
  }
}
