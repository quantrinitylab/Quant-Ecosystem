import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { CSPGenerator } from '@quant/security';

// QC-F-153 regression pin for the security headers in next.config.js.
//
// The Permissions-Policy header used to ship `camera=(), microphone=(),
// geolocation=()`. An empty allowlist blocks those features on THIS origin
// too — before the browser's own permission prompt — which silently killed
// the camera tab, story creator, duet mode, avatar capture, voice notes,
// calls/meet media and the map's own location, with a NotAllowedError that
// looked like a user denial. The fix grants each feature to `(self)` only:
// the browser prompt remains the real gate and no embedded frame is allowed.
//
// These tests pin the exact header set so a future "hardening" pass cannot
// quietly revert the value (or any sibling header) without turning CI red.
//
// QC-F-155 extends the same pin to the Content-Security-Policy header, which
// was missing entirely while its six siblings shipped from this one config.
// Slice-1 is Report-Only: the directives live in ../../csp-policy.js (plain
// JS, the single source the config itself requires), and the NC-155 tests
// below pin the emitted value byte-for-byte, forbid the dangerous allowances
// a careless "fix" would reach for (wildcards, bare https:, unsafe-eval, a
// phantom report endpoint), and hold the policy to parity with
// @quant/security's CSPGenerator so the ecosystem keeps one policy source.

const require = createRequire(import.meta.url);

interface HeaderEntry {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

const nextConfig = require('../../next.config.js') as {
  headers: () => Promise<HeaderEntry[]>;
};

interface CspPolicyModule {
  CSP_DIRECTIVES: Array<[string, string[]]>;
  buildCspValue: () => string;
  buildCspHeader: () => { key: string; value: string };
}

// Loaded defensively: on pre-fix code the module does not exist, and the
// NC-155 tests must then fail with their own signatures (policy absent),
// not with a suite-level import crash that would also mask the QC-F-153 pins.
let cspPolicy: CspPolicyModule | null = null;
try {
  cspPolicy = require('../../csp-policy.js') as CspPolicyModule;
} catch {
  cspPolicy = null;
}

// The band Slice-1 value (specialist-qc-f-155-buildprep.md §4.1), written out
// in full so a drift in csp-policy.js turns this file red instead of silently
// following the code.
const EXPECTED_CSP_VALUE =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https://quantchat-media.s3.amazonaws.com; " +
  "media-src 'self' data: blob: https://quantchat-media.s3.amazonaws.com; " +
  "font-src 'self'; " +
  "connect-src 'self' wss: https://quantchat-media.s3.amazonaws.com; " +
  "worker-src 'self' blob:; frame-src 'self'; child-src 'self' blob:; " +
  "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

async function globalEntry(): Promise<HeaderEntry> {
  const entries = await nextConfig.headers();
  const entry = entries.find((e) => e.source === '/:path*');
  if (!entry) throw new Error('next.config.js headers() has no /:path* entry');
  return entry;
}

describe('security headers (next.config.js) — QC-F-153', () => {
  it('applies exactly one global header entry to every route', async () => {
    const entries = await nextConfig.headers();
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('/:path*');
  });

  it('grants camera, microphone and geolocation to (self) — never fully closed, never wildcarded', async () => {
    const entry = await globalEntry();
    const policy = entry.headers.find((h) => h.key === 'Permissions-Policy');
    expect(policy?.value).toBe(
      'camera=(self), microphone=(self), geolocation=(self)',
    );
  });

  it('Permissions-Policy allows no origin other than self for any feature', async () => {
    const entry = await globalEntry();
    const policy = entry.headers.find((h) => h.key === 'Permissions-Policy');
    const directives = (policy?.value ?? '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    expect(directives).toHaveLength(3);
    for (const directive of directives) {
      const match = /^(camera|microphone|geolocation)=\(([^)]*)\)$/.exec(
        directive,
      );
      expect(match, `unexpected Permissions-Policy directive: ${directive}`).not.toBeNull();
      // Only `self` inside the allowlist — no `*`, no bare origins, not empty.
      expect(match?.[2].trim()).toBe('self');
    }
  });

  it('no second entry overrides the Permissions-Policy', async () => {
    const entries = await nextConfig.headers();
    const setters = entries.filter((e) =>
      e.headers.some((h) => h.key === 'Permissions-Policy'),
    );
    expect(setters).toHaveLength(1);
  });

  it('keeps every sibling security header byte-identical to the shipped set', async () => {
    const entry = await globalEntry();
    expect(entry.headers).toEqual([
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(self), microphone=(self), geolocation=(self)',
      },
      // QC-F-155 (PIN-155-01, deliberate amend): the Report-Only CSP entry is
      // appended to the shipped set; the six QC-F-153 entries above are
      // byte-unchanged. Widening this expectation in any other way re-opens
      // the QC-F-153 regression this test exists to catch.
      { key: 'Content-Security-Policy-Report-Only', value: EXPECTED_CSP_VALUE },
    ]);
  });
});

describe('Content-Security-Policy (next.config.js) — QC-F-155', () => {
  async function cspHeader(): Promise<{ key: string; value: string } | undefined> {
    const entry = await globalEntry();
    return entry.headers.find((h) => h.key === 'Content-Security-Policy-Report-Only');
  }

  it('NC-155-01: emits Content-Security-Policy-Report-Only with the exact band value', async () => {
    const header = await cspHeader();
    expect(header, 'CSP Report-Only header is not emitted').toBeDefined();
    expect(header?.value).toBe(EXPECTED_CSP_VALUE);
    // The config must be serving the policy module's own output, not a
    // second hand-written copy of the string.
    expect(cspPolicy, 'csp-policy.js policy module is missing').not.toBeNull();
    expect(header).toEqual(cspPolicy?.buildCspHeader());
  });

  it('NC-155-02: exactly one CSP-family setter exists, and it is Report-Only (no enforce header in Slice-1)', async () => {
    const entries = await nextConfig.headers();
    const cspKeys = entries.flatMap((e) =>
      e.headers.map((h) => h.key).filter((k) => k.toLowerCase().startsWith('content-security-policy')),
    );
    expect(cspKeys).toEqual(['Content-Security-Policy-Report-Only']);
  });

  it('NC-155-03: the emitted value contains no nonce token', async () => {
    const header = await cspHeader();
    expect(header, 'CSP Report-Only header is not emitted').toBeDefined();
    expect(header?.value).not.toContain("'nonce-");
  });

  it('NC-155-04: parity — @quant/security CSPGenerator fed the same directive map emits the same header', () => {
    expect(cspPolicy, 'csp-policy.js policy module is missing').not.toBeNull();
    const generator = new CSPGenerator();
    generator.setReportOnly(true);
    for (const [name, values] of cspPolicy?.CSP_DIRECTIVES ?? []) {
      generator.setDirective(name, [...values]);
    }
    expect(generator.getHeaderName()).toBe('Content-Security-Policy-Report-Only');
    // generate() appends a fresh random 'nonce-…' token to script-src and
    // style-src on every call; that token is precisely what the shipped
    // policy must NOT carry (NC-155-03), so parity is judged after removing
    // the generator's own nonce tokens from its output.
    const generated = generator.generate().generated;
    const withoutNonces = generated.replace(/ 'nonce-[^']+'/g, '');
    expect(withoutNonces).toBe(cspPolicy?.buildCspValue());
    expect(withoutNonces).toBe(EXPECTED_CSP_VALUE);
  });

  it('NC-155-05: no dangerous allowance, and the hard directives are present', async () => {
    const header = await cspHeader();
    expect(header, 'CSP Report-Only header is not emitted').toBeDefined();
    const value = header?.value ?? '';
    const directives = value.split(';').map((d) => d.trim()).filter(Boolean);
    const tokens = directives.flatMap((d) => d.split(/\s+/));
    // No wildcard source, no scheme-wide https:, no unsafe-eval anywhere.
    expect(tokens).not.toContain('*');
    expect(tokens).not.toContain('https:');
    expect(tokens).not.toContain("'unsafe-eval'");
    // script-src must never allow data: URLs.
    const scriptSrc = directives.find((d) => d.startsWith('script-src ')) ?? '';
    expect(scriptSrc.split(/\s+/)).not.toContain('data:');
    // The three hard directives are mandatory.
    expect(directives).toContain("object-src 'none'");
    expect(directives).toContain("base-uri 'self'");
    expect(directives).toContain("frame-ancestors 'none'");
  });

  it('HG-155-06: no report-uri/report-to — there is no CSP report collector to send reports to', async () => {
    const header = await cspHeader();
    expect(header, 'CSP Report-Only header is not emitted').toBeDefined();
    expect(header?.value).not.toContain('report-uri');
    expect(header?.value).not.toContain('report-to');
  });
});
