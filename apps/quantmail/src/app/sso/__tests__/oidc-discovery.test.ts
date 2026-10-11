import { GET as getOidc } from '../../.well-known/openid-configuration/route';

// NOTE: the legacy /oauth/authorize -> /sso redirect shim (route.ts, PR #795) was
// removed in PR #861: /oauth/authorize is now served by the branded OAuth
// consent page (page.tsx), which validates redirect_uri itself instead of
// bouncing to /sso. API clients use GET /api/oauth/authorize instead.

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
});
