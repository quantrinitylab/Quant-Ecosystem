import { describe, it, expect, beforeAll } from 'vitest';

// F-212: the app must ship a Content-Security-Policy alongside the other
// hardening headers. This test imports the real next.config.js and asserts on
// the ACTUAL header value — a config regression (deleted/weakened CSP) fails
// CI instead of silently shipping.
import nextConfig from '../../next.config.js';

interface HeaderEntry {
  key: string;
  value: string;
}
interface HeaderRule {
  source: string;
  headers: HeaderEntry[];
}

async function globalHeaders(): Promise<HeaderEntry[]> {
  const config = nextConfig as unknown as { headers?: () => Promise<HeaderRule[]> };
  if (typeof config.headers !== 'function') {
    throw new Error('next.config.js must define headers()');
  }
  const rules = await config.headers();
  const global = rules.find((r) => r.source === '/:path*');
  if (!global) throw new Error('next.config.js must define a /:path* header rule');
  return global.headers;
}

function cspValue(headers: HeaderEntry[]): string {
  const header = headers.find((h) => h.key === 'Content-Security-Policy');
  if (!header) throw new Error('Content-Security-Policy header is missing');
  return header.value;
}

describe('Security headers (next.config.js)', () => {
  let headers: HeaderEntry[] = [];

  beforeAll(async () => {
    headers = await globalHeaders();
  });

  it('ships a Content-Security-Policy header', () => {
    expect(() => cspValue(headers)).not.toThrow();
    expect(cspValue(headers).length).toBeGreaterThan(50);
  });

  it('locks the document to first-party by default', () => {
    const value = cspValue(headers);
    expect(value).toContain("default-src 'self'");
    expect(value).toContain("object-src 'none'");
    expect(value).toContain("base-uri 'self'");
    expect(value).toContain("frame-ancestors 'none'");
    expect(value).toContain('upgrade-insecure-requests');
  });

  it('never allowlists third-party script CDNs at page level', () => {
    const value = cspValue(headers);
    // The artifact preview's tailwind CDN lives behind the sandboxed iframe's
    // own `csp` attribute — it must NOT leak into the page policy.
    expect(value).not.toContain('cdn.tailwindcss.com');
    expect(value).not.toMatch(/script-src[^;]*https:/);
  });

  it('reports violations to the first-party collector', () => {
    expect(cspValue(headers)).toContain('report-uri /api/csp-report');
  });

  it('keeps the pre-existing hardening headers intact', () => {
    const keys = headers.map((h) => h.key);
    for (const required of [
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(keys).toContain(required);
    }
  });
});
