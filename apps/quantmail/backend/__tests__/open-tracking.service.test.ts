// ============================================================================
// QuantMail - Open-tracking service tests (fix/qm-composer-open-tracking-2)
//
// Covers the beacon building blocks: token minting, pixel injection into
// outbound MIME (never the stored body), and open counting. These are the
// primitives the composer toggle + sent-view indicator rest on.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import {
  OPEN_TRACKING_GIF,
  OPEN_TRACKING_TOKEN_RE,
  mintOpenToken,
  openTrackingBaseUrl,
  openTrackingBeaconUrl,
  recordOpen,
  withOpenTrackingPixel,
  trackingHtmlAlternative,
  type OpenTrackingStore,
} from '../services/open-tracking.service';

function fakeStore(rows: Array<{ id: string; openToken: string | null; firstOpenedAt?: Date | null }>): {
  store: OpenTrackingStore;
  updates: Array<unknown>;
} {
  const updates: Array<unknown> = [];
  const store: OpenTrackingStore = {
    email: {
      findUnique: async (args: unknown) => {
        const token = (args as { where?: { openToken?: string } }).where?.openToken;
        const row = rows.find((r) => r.openToken === token);
        return row ? { id: row.id, firstOpenedAt: row.firstOpenedAt ?? null } : null;
      },
      update: async (args: unknown) => {
        updates.push(args);
        return { ok: true };
      },
    },
  };
  return { store, updates };
}

describe('mintOpenToken', () => {
  it('mints 48-char hex tokens matching the beacon regex', () => {
    for (let i = 0; i < 50; i++) {
      const token = mintOpenToken();
      expect(token).toMatch(OPEN_TRACKING_TOKEN_RE);
      expect(token).toHaveLength(48);
    }
  });

  it('never repeats a token', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const token = mintOpenToken();
      expect(seen.has(token)).toBe(false);
      seen.add(token);
    }
  });
});

describe('withOpenTrackingPixel', () => {
  const token = 'a'.repeat(48);
  const body = '<p>Hello</p>';

  it('appends the beacon img for a valid token', () => {
    const out = withOpenTrackingPixel(body, token);
    expect(out).toContain(`/api/track/open/${token}`);
    expect(out).toContain('width="1"');
    expect(out).toBeDefined();
    expect((out as string).startsWith(body)).toBe(true);
  });

  it('returns the body unchanged when the token is missing (tracking off)', () => {
    expect(withOpenTrackingPixel(body, null)).toBe(body);
    expect(withOpenTrackingPixel(body, undefined)).toBe(body);
    expect(withOpenTrackingPixel(body, '')).toBe(body);
  });

  it('returns the body unchanged for a malformed token — never injects attacker text', () => {
    const evil = '"><script>alert(1)</script>';
    expect(withOpenTrackingPixel(body, evil)).toBe(body);
    expect(withOpenTrackingPixel(body, 'short')).toBe(body);
  });

  it('is idempotent — a retry never stacks pixels', () => {
    const once = withOpenTrackingPixel(body, token)!;
    const twice = withOpenTrackingPixel(once, token)!;
    expect(twice).toBe(once);
    expect(twice.match(/\/api\/track\/open\//g)).toHaveLength(1);
  });

  it('passes empty/missing bodies through without inventing markup', () => {
    expect(withOpenTrackingPixel('', token)).toBe('');
    expect(withOpenTrackingPixel(null, token)).toBeUndefined();
    expect(withOpenTrackingPixel(undefined, token)).toBeUndefined();
    expect(withOpenTrackingPixel('   ', token)).toBe('   ');
  });
});

describe('openTrackingBaseUrl / openTrackingBeaconUrl', () => {
  it('prefers OPEN_TRACKING_BASE_URL and trims trailing slashes', () => {
    vi.stubEnv('OPEN_TRACKING_BASE_URL', 'https://beacon.example.com///');
    expect(openTrackingBaseUrl()).toBe('https://beacon.example.com');
    vi.unstubAllEnvs();
  });

  it('falls back to the production domain', () => {
    // undefined deletes the var (?? falls through to the next fallback).
    vi.stubEnv('OPEN_TRACKING_BASE_URL', undefined);
    vi.stubEnv('PASSWORD_RESET_APP_URL', undefined);
    vi.stubEnv('WORKSPACE_APP_URL', undefined);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined);
    expect(openTrackingBaseUrl()).toBe('https://quantmail.in');
    vi.unstubAllEnvs();
  });

  it('builds the absolute beacon URL on the /api path', () => {
    const token = 'b'.repeat(48);
    expect(openTrackingBeaconUrl(token)).toBe(`https://quantmail.in/api/track/open/${token}`);
  });
});

describe('recordOpen', () => {
  it('counts a valid token: openCount++, stamps first + last opened', async () => {
    const token = 'c'.repeat(48);
    const { store, updates } = fakeStore([{ id: 'email-1', openToken: token }]);
    const ok = await recordOpen(store, token);
    expect(ok).toBe(true);
    expect(updates).toHaveLength(1);
    const data = (updates[0] as { data: Record<string, unknown> }).data;
    expect(data['openCount']).toEqual({ increment: 1 });
    expect(data['firstOpenedAt']).toBeInstanceOf(Date);
    expect(data['lastOpenedAt']).toBeInstanceOf(Date);
  });

  it('never overwrites firstOpenedAt on repeat opens', async () => {
    const token = 'd'.repeat(48);
    const first = new Date('2026-10-01T10:00:00Z');
    const { store, updates } = fakeStore([{ id: 'email-1', openToken: token, firstOpenedAt: first }]);
    const ok = await recordOpen(store, token);
    expect(ok).toBe(true);
    const data = (updates[0] as { data: Record<string, unknown> }).data;
    expect(data['firstOpenedAt']).toBeUndefined();
    expect(data['lastOpenedAt']).toBeInstanceOf(Date);
    expect(data['openCount']).toEqual({ increment: 1 });
  });

  it('returns false for unknown tokens without touching the DB', async () => {
    const { store, updates } = fakeStore([{ id: 'email-1', openToken: 'e'.repeat(48) }]);
    expect(await recordOpen(store, 'f'.repeat(48))).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it('returns false for malformed/missing tokens without a DB call', async () => {
    const findUnique = vi.fn(async () => null);
    const store: OpenTrackingStore = {
      email: { findUnique, update: vi.fn(async () => ({})) },
    };
    expect(await recordOpen(store, 'not-a-token')).toBe(false);
    expect(await recordOpen(store, null)).toBe(false);
    expect(await recordOpen(store, undefined)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('propagates DB errors to the caller (the route decides the pixel policy)', async () => {
    const store: OpenTrackingStore = {
      email: {
        findUnique: async () => {
          throw new Error('db down');
        },
        update: async () => ({}),
      },
    };
    await expect(recordOpen(store, 'a'.repeat(48))).rejects.toThrow('db down');
  });
});

describe('OPEN_TRACKING_GIF', () => {
  it('is a non-empty GIF payload', () => {
    expect(OPEN_TRACKING_GIF.length).toBeGreaterThan(0);
    // GIF89a magic
    expect(OPEN_TRACKING_GIF.subarray(0, 6).toString('ascii')).toBe('GIF89a');
  });
});

describe('trackingHtmlAlternative', () => {
  const TOKEN = 'a'.repeat(48);
  it('builds a safe HTML alternative with the beacon for plain-text-only mail', () => {
    const html = trackingHtmlAlternative('hello\nworld', TOKEN);
    expect(html).toContain('<p>hello</p>');
    expect(html).toContain('<p>world</p>');
    expect(html).toContain(`/api/track/open/${TOKEN}`);
  });
  it('escapes HTML in the plain text', () => {
    const html = trackingHtmlAlternative('<script>alert(1)</script>', TOKEN);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('returns undefined when tracking is off (no token)', () => {
    expect(trackingHtmlAlternative('hello', null)).toBeUndefined();
    expect(trackingHtmlAlternative('hello', '')).toBeUndefined();
  });
  it('returns undefined for empty text', () => {
    expect(trackingHtmlAlternative('   ', TOKEN)).toBeUndefined();
  });
});
