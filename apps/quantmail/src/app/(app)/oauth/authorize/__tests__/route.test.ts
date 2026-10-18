// ============================================================================
// Tests for the Next.js GET /oauth/authorize route
// (src/app/oauth/authorize/route.ts).
// ============================================================================
//
// /oauth/authorize is the browser entry point third-party apps link to
// ("Sign in with QuantMail"). A request missing `client_id` or
// `redirect_uri` used to answer every caller with a bare
// `{"error":"invalid_request"}` JSON body — a white browser page with no
// branding and no explanation of what went wrong.
//
// Now the route content-negotiates on the Accept header:
//   - browser visitors (Accept: text/html,...) get a branded dark HTML error
//     page that names the missing parameter and says what to do next;
//   - API/programmatic callers (Accept: application/json, */*, or missing)
//     keep the exact JSON shape they had before.
//
// Tests call the exported GET handler directly with constructed NextRequests,
// like the sibling route tests (see api/oauth/consent/__tests__/route.test.ts).

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from '../route';

const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

function get(url: string, accept?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (accept !== undefined) headers['accept'] = accept;
  return new NextRequest(url, { headers });
}

describe('GET /oauth/authorize', () => {
  it('redirects valid requests to /sso with returnTo (happy path unchanged)', async () => {
    const res = await GET(
      get(
        'http://localhost:3000/oauth/authorize?client_id=quantchat&redirect_uri=https%3A%2F%2Fapp.test%2Fcb&state=abc',
        BROWSER_ACCEPT,
      ),
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('Location') ?? '';
    expect(location).toContain('/sso?');
    expect(location).toContain('returnTo=https%3A%2F%2Fapp.test%2Fcb');
    expect(location).toContain('client_id=quantchat');
  });

  it('renders a branded dark error page for browsers when redirect_uri is missing', async () => {
    const res = await GET(
      get('http://localhost:3000/oauth/authorize?client_id=bogus', BROWSER_ACCEPT),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    // Not raw JSON on a white page
    expect(html.trimStart().startsWith('{')).toBe(false);
    // Pure-black branded page
    expect(html).toContain('background: #000000');
    expect(html).toContain('QuantMail');
    // Names the problem honestly
    expect(html).toContain('Error 400');
    expect(html).toContain('sign-in link is incomplete');
    expect(html).toContain('redirect_uri');
    // Tells the visitor what to do next
    expect(html).toContain('What you can do');
    expect(html).toContain('Back to QuantMail');
    // No divider lines
    expect(html).not.toContain('<hr');
  });

  it('names client_id as the missing parameter when redirect_uri is present', async () => {
    const res = await GET(
      get(
        'http://localhost:3000/oauth/authorize?redirect_uri=https%3A%2F%2Fapp.test%2Fcb',
        BROWSER_ACCEPT,
      ),
    );
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('client_id');
    expect(html).toContain('sign-in link is incomplete');
  });

  it('still returns JSON for API clients that ask for application/json', async () => {
    const res = await GET(
      get('http://localhost:3000/oauth/authorize?client_id=bogus', 'application/json'),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
    const data = await res.json();
    expect(data.error).toBe('invalid_request');
    expect(typeof data.error_description).toBe('string');
  });

  it('keeps JSON when the client accepts json before html', async () => {
    const res = await GET(
      get(
        'http://localhost:3000/oauth/authorize?client_id=bogus',
        'application/json, text/html;q=0.9',
      ),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
    const data = await res.json();
    expect(data.error).toBe('invalid_request');
  });

  it('keeps JSON for curl-style */* and missing Accept (programmatic default)', async () => {
    for (const accept of ['*/*', undefined]) {
      const res = await GET(
        get('http://localhost:3000/oauth/authorize?client_id=bogus', accept),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_request');
    }
  });

  it('does not cache the error page', async () => {
    const res = await GET(
      get('http://localhost:3000/oauth/authorize?client_id=bogus', BROWSER_ACCEPT),
    );
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
});
