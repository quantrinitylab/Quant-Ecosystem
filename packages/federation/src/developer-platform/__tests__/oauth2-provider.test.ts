import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { OAuth2Provider } from '../oauth2-provider.js';

describe('OAuth2Provider', () => {
  function createProviderWithClient() {
    const provider = new OAuth2Provider();
    provider.registerClient({
      clientId: 'test-client',
      clientSecret: 'test-secret',
      name: 'Test App',
      redirectUris: ['https://app.example.com/callback'],
      scopes: ['read', 'write', 'admin'],
      grantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
    });
    return provider;
  }

  it('registers and retrieves a client', () => {
    const provider = createProviderWithClient();
    const client = provider.getClient('test-client');

    expect(client).not.toBeNull();
    expect(client!.name).toBe('Test App');
  });

  it('issues authorization code and exchanges for token', () => {
    const provider = createProviderWithClient();

    const authResult = provider.authorize(
      {
        responseType: 'code',
        clientId: 'test-client',
        redirectUri: 'https://app.example.com/callback',
        scope: 'read write',
        state: 'xyz',
      },
      'user-123',
    );

    expect('code' in authResult).toBe(true);
    const { code, state } = authResult as { code: string; state: string };
    expect(state).toBe('xyz');

    const tokenResult = provider.token({
      grantType: 'authorization_code',
      clientId: 'test-client',
      code,
      redirectUri: 'https://app.example.com/callback',
    });

    expect('access_token' in tokenResult).toBe(true);
    const token = tokenResult as {
      access_token: string;
      token_type: string;
      refresh_token: string;
    };
    expect(token.token_type).toBe('Bearer');
    expect(token.refresh_token).toBeDefined();
  });

  it('supports PKCE with S256 challenge', () => {
    const provider = createProviderWithClient();

    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const authResult = provider.authorize(
      {
        responseType: 'code',
        clientId: 'test-client',
        redirectUri: 'https://app.example.com/callback',
        scope: 'read',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      },
      'user-456',
    );

    const { code } = authResult as { code: string };

    const tokenResult = provider.token({
      grantType: 'authorization_code',
      clientId: 'test-client',
      code,
      redirectUri: 'https://app.example.com/callback',
      codeVerifier: verifier,
    });

    expect('access_token' in tokenResult).toBe(true);
  });

  it('rejects PKCE with wrong verifier', () => {
    const provider = createProviderWithClient();

    const challenge = createHash('sha256').update('correct-verifier').digest('base64url');

    const authResult = provider.authorize(
      {
        responseType: 'code',
        clientId: 'test-client',
        redirectUri: 'https://app.example.com/callback',
        scope: 'read',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      },
      'user-789',
    );

    const { code } = authResult as { code: string };

    const tokenResult = provider.token({
      grantType: 'authorization_code',
      clientId: 'test-client',
      code,
      redirectUri: 'https://app.example.com/callback',
      codeVerifier: 'wrong-verifier',
    });

    expect('error' in tokenResult).toBe(true);
  });

  it('handles client credentials grant', () => {
    const provider = createProviderWithClient();

    const result = provider.token({
      grantType: 'client_credentials',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      scope: 'read',
    });

    expect('access_token' in result).toBe(true);
    const token = result as { access_token: string; scope: string };
    expect(token.scope).toBe('read');
  });

  it('introspects a valid token', () => {
    const provider = createProviderWithClient();

    const result = provider.token({
      grantType: 'client_credentials',
      clientId: 'test-client',
      clientSecret: 'test-secret',
    });

    const token = result as { access_token: string };
    const info = provider.introspect(token.access_token);

    expect(info.active).toBe(true);
    expect(info.client_id).toBe('test-client');
  });

  it('revokes a token', () => {
    const provider = createProviderWithClient();

    const result = provider.token({
      grantType: 'client_credentials',
      clientId: 'test-client',
      clientSecret: 'test-secret',
    });

    const token = result as { access_token: string };
    const revoked = provider.revoke(token.access_token);
    expect(revoked).toBe(true);

    const info = provider.introspect(token.access_token);
    expect(info.active).toBe(false);
  });

  it('handles refresh token flow', () => {
    const provider = createProviderWithClient();

    const authResult = provider.authorize(
      {
        responseType: 'code',
        clientId: 'test-client',
        redirectUri: 'https://app.example.com/callback',
        scope: 'read',
      },
      'user-refresh',
    );

    const { code } = authResult as { code: string };
    const tokenResult = provider.token({
      grantType: 'authorization_code',
      clientId: 'test-client',
      code,
      redirectUri: 'https://app.example.com/callback',
    });

    const { refresh_token } = tokenResult as { refresh_token: string };

    const refreshResult = provider.token({
      grantType: 'refresh_token',
      clientId: 'test-client',
      refreshToken: refresh_token,
    });

    expect('access_token' in refreshResult).toBe(true);
  });

  it('rejects invalid client', () => {
    const provider = createProviderWithClient();

    const result = provider.token({
      grantType: 'client_credentials',
      clientId: 'nonexistent',
      clientSecret: 'secret',
    });

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('invalid_client');
  });
});
