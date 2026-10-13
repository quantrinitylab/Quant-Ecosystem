// @vitest-environment node
// ============================================================================
// quantmail — edge middleware: edge-cacheable auth shell
// (fix/qm-login-paint-vs-gmail)
//
// The four auth-form pages render identical HTML for every signed-out
// visitor, so their document responses must be publicly cacheable at the
// edge (cold TTFB 3.1s → edge-served). RSC flight / prefetch requests must
// NEVER get the public header: they expect a text/x-component payload, and
// a cached document would corrupt client-side navigation.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  AUTH_SHELL_CACHE_CONTROL,
  AUTH_SHELL_HEADER,
  isRscRequest,
  middleware,
} from '../middleware';

const docReq = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(url, { headers });

describe('auth shell edge-cache headers', () => {
  const authPaths = [
    'http://x.test/login',
    'http://x.test/register',
    'http://x.test/forgot-password',
    'http://x.test/reset-password',
  ];

  it.each(authPaths)('%s document response is edge-cacheable', (url) => {
    const res = middleware(docReq(url));
    expect(res.headers.get('Cache-Control')).toBe(AUTH_SHELL_CACHE_CONTROL);
    // Browsers must revalidate (no stale form); only shared caches hold it.
    expect(AUTH_SHELL_CACHE_CONTROL).toContain('s-maxage=');
    expect(AUTH_SHELL_CACHE_CONTROL).toMatch(/max-age=0/);
  });

  it.each(authPaths)('%s still tags the request for the lean auth shell', (url) => {
    const res = middleware(docReq(url));
    // NextResponse.next({ request: { headers } }) surfaces overridden
    // request headers as x-middleware-request-* on the pass-through.
    expect(res.headers.get(`x-middleware-request-${AUTH_SHELL_HEADER}`)).toBe('auth');
  });

  it.each(authPaths)('%s RSC flight request is NOT publicly cached', (url) => {
    const res = middleware(docReq(url, { rsc: '1' }));
    expect(res.headers.get('Cache-Control')).not.toBe(AUTH_SHELL_CACHE_CONTROL);
  });

  it.each(authPaths)('%s prefetch request is NOT publicly cached', (url) => {
    const res = middleware(
      docReq(url, { rsc: '1', 'next-router-prefetch': '1' }),
    );
    expect(res.headers.get('Cache-Control')).not.toBe(AUTH_SHELL_CACHE_CONTROL);
  });

  it('non-auth public paths get no cache header', () => {
    for (const url of ['http://x.test/help', 'http://x.test/privacy', 'http://x.test/sso']) {
      const res = middleware(docReq(url));
      expect(res.headers.get('Cache-Control')).toBeNull();
    }
  });

  it('guarded-path redirect for signed-out visitors is unchanged', () => {
    const res = middleware(docReq('http://x.test/drive'));
    expect(res.headers.get('location')).toBe('http://x.test/login?returnTo=%2Fdrive');
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  it('isRscRequest detects flight headers', () => {
    expect(isRscRequest(docReq('http://x.test/login'))).toBe(false);
    expect(isRscRequest(docReq('http://x.test/login', { rsc: '1' }))).toBe(true);
  });
});
