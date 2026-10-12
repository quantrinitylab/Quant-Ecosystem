import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

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

const require = createRequire(import.meta.url);

interface HeaderEntry {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

const nextConfig = require('../../next.config.js') as {
  headers: () => Promise<HeaderEntry[]>;
};

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
    ]);
  });
});
