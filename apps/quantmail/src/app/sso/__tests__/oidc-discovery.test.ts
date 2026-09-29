import { NextRequest } from 'next/server';
import { GET as getOidc } from '../../.well-known/openid-configuration/route';
import { GET as getAuthorize } from '../../oauth/authorize/route';

describe('OIDC Discovery & OAuth Authorize', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('GET /.well-known/openid-configuration', () => {
    it('returns valid OIDC discovery configuration', async () => {
      process.env.QUANTMAIL_ISSUER = 'https://quantmail.in';
      const response = await getOidc();
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.issuer).toBe('https://quantmail.in');
      expect(data.authorization_endpoint).toBe('https://quantmail.in/sso');
      expect(data.token_endpoint).toBe('https://quantmail.in/api/oauth/token');
      expect(data.scopes_supported).toContain('openid');
    });
  });

  describe('GET /oauth/authorize', () => {
    it('redirects /oauth/authorize to /sso with mapped params', async () => {
      const req = new NextRequest(
        'http://localhost:3000/oauth/authorize?client_id=123&redirect_uri=https://example.com/callback&state=xyz&scope=openid',
      );
      const response = await getAuthorize(req);

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toBeDefined();

      const url = new URL(location!);
      expect(url.pathname).toBe('/sso');
      expect(url.searchParams.get('client_id')).toBe('123');
      expect(url.searchParams.get('returnTo')).toBe('https://example.com/callback');
      expect(url.searchParams.get('state')).toBe('xyz');
      expect(url.searchParams.get('scope')).toBe('openid');
      expect(url.searchParams.has('redirect_uri')).toBe(false);
    });

    it('returns 400 for missing client_id or redirect_uri', async () => {
      const req = new NextRequest('http://localhost:3000/oauth/authorize?client_id=123');
      const response = await getAuthorize(req);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('invalid_request');
    });
  });
});
