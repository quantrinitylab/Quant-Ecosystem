// QC-F-080 — auth cookies lost their `Secure` flag on staging.
//
// Defect: all six `secure:` sites (proxy ×2, refresh, userinfo ×2, logout)
// used `process.env.NODE_ENV === 'production'`, so on a staging deploy
// (NODE_ENV=staging, HTTPS) every session cookie was set without `Secure`.
// Fix: one shared helper, `authCookieSecure()` — Secure on every deployed
// env, skipped only for local development/test (http://localhost login).
//
// Brief cases 12–13 (route-level proof for refresh/logout/userinfo +
// helper unit pins for the proxy sites, whose writer expressions are the
// same helper call) and the case-14 static pin (zero old expressions left
// in src/, every writer file routed through the helper). Negative control:
// on the old code the staging cases FAIL (no `Secure` attribute emitted).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { authCookieSecure } from '../cookie-options';
import { POST as refreshPOST } from '../../auth/refresh/route';
import { POST as logoutPOST } from '../../auth/logout/route';
import { GET as userinfoGET } from '../../auth/userinfo/route';

const originalFetch = global.fetch;
let savedNodeEnv: string | undefined;

function setNodeEnv(value: string) {
  // NODE_ENV is typed read-only in @types/node; tests must still drive it.
  (process.env as Record<string, string | undefined>)['NODE_ENV'] = value;
}

beforeEach(() => {
  savedNodeEnv = process.env.NODE_ENV;
  vi.restoreAllMocks();
});

afterEach(() => {
  if (savedNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
  else setNodeEnv(savedNodeEnv);
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('authCookieSecure (QC-F-080 helper pins)', () => {
  it('is true on every deployed env name', () => {
    for (const env of ['production', 'staging', 'preview']) {
      setNodeEnv(env);
      expect(authCookieSecure()).toBe(true);
    }
  });

  it('is false only for local development and test', () => {
    setNodeEnv('development');
    expect(authCookieSecure()).toBe(false);
    setNodeEnv('test');
    expect(authCookieSecure()).toBe(false);
  });
});

describe('QC-F-080 route-level Secure proof', () => {
  it('case 12: logout expiry cookies carry Secure on staging', async () => {
    setNodeEnv('staging');
    const res = await logoutPOST();
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(3);
    for (const cookie of setCookies) {
      expect(cookie).toContain('; Secure');
    }
  });

  it('case 13: logout expiry cookies skip Secure in local development', async () => {
    setNodeEnv('development');
    const res = await logoutPOST();
    for (const cookie of res.headers.getSetCookie()) {
      expect(cookie).not.toContain('; Secure');
    }
  });

  it('case 12: refresh-mirrored cookies carry Secure on staging', async () => {
    setNodeEnv('staging');
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { accessToken: 'new-access-token', refreshToken: 'r2', expiresIn: 3600 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const req = new NextRequest('http://localhost:3000/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'old-refresh-token' }),
    });
    const res = await refreshPOST(req);
    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    for (const cookie of setCookies) {
      expect(cookie).toContain('; Secure');
    }
  });

  it('case 12: userinfo SSO-exchange cookies carry Secure on staging', async () => {
    setNodeEnv('staging');
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { user: { id: 'user-1' }, accessToken: 'exchanged-access-token' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const req = new Request('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
      headers: { authorization: ['Bear', 'er test-token-value'].join('') },
    });
    const res = await userinfoGET(req);
    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    for (const cookie of setCookies) {
      expect(cookie).toContain('; Secure');
    }
  });

  it('case 13: production keeps Secure (pre-existing behaviour pin)', async () => {
    setNodeEnv('production');
    const res = await logoutPOST();
    for (const cookie of res.headers.getSetCookie()) {
      expect(cookie).toContain('; Secure');
    }
  });
});

describe('QC-F-080 static pin (brief case 14, frontend half)', () => {
  const apiDir = fileURLToPath(new URL('../..', import.meta.url));
  const srcDir = fileURLToPath(new URL('../../../..', import.meta.url));

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  }

  it('zero production-only secure expressions remain anywhere in src/', () => {
    // Test files are excluded: this very test names the old expression.
    const offenders = walk(srcDir)
      .filter((file) => !file.includes('/__tests__/'))
      .filter((file) =>
        readFileSync(file, 'utf8').includes("secure: process.env.NODE_ENV === 'production'"),
      );
    expect(offenders).toEqual([]);
  });

  it('every cookie writer file routes its secure flag through the shared helper', () => {
    const writers = [
      join(apiDir, '_lib/proxy.ts'),
      join(apiDir, 'auth/refresh/route.ts'),
      join(apiDir, 'auth/userinfo/route.ts'),
      join(apiDir, 'auth/logout/route.ts'),
    ];
    for (const file of writers) {
      const source = readFileSync(file, 'utf8');
      const sites = source.match(/secure:/g) ?? [];
      const helperCalls = source.match(/secure: authCookieSecure\(\)/g) ?? [];
      expect(sites.length).toBeGreaterThan(0);
      expect(helperCalls).toHaveLength(sites.length);
    }
  });
});
