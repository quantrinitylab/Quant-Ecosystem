// @vitest-environment node
// ============================================================================
// QuantMail — OIDC issuer consistency (fix/qm-oidc-issuer-mismatch)
// ============================================================================
//
// Regression proof for the issuer mismatch: the backend used to default its
// OIDC issuer to https://quantmail.com while the Next public discovery
// advertised https://quantmail.in, so id_tokens minted with env unset carried
// iss=https://quantmail.com against discovery's https://quantmail.in and
// discovery-reading relying parties failed iss validation.
//
// These tests pin the contract: with QUANTMAIL_ISSUER unset, getIssuer(),
// the backend discovery document, and the minted id_token `iss` all agree on
// https://quantmail.in — the same default the Next public discovery uses.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as jose from 'jose';
import { getIssuer, buildOpenIdConfiguration } from '../routes/oauth';
import { OidcKeyService } from '../services/oidc-key.service';

const silentLogger = { warn: () => {} };

describe('OIDC issuer consistency', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to the live domain https://quantmail.in when QUANTMAIL_ISSUER is unset', () => {
    delete process.env.QUANTMAIL_ISSUER;
    expect(getIssuer()).toBe('https://quantmail.in');
  });

  it('honours QUANTMAIL_ISSUER when set', () => {
    process.env.QUANTMAIL_ISSUER = 'https://issuer.example.test';
    expect(getIssuer()).toBe('https://issuer.example.test');
  });

  it('advertises the same issuer as getIssuer() with all endpoints under it', () => {
    delete process.env.QUANTMAIL_ISSUER;
    const doc = buildOpenIdConfiguration();
    expect(doc.issuer).toBe('https://quantmail.in');
    for (const key of [
      'authorization_endpoint',
      'token_endpoint',
      'revocation_endpoint',
      'registration_endpoint',
      'jwks_uri',
    ] as const) {
      expect(String(doc[key]).startsWith('https://quantmail.in/')).toBe(true);
    }

    // Env override flows through to both issuer and endpoints.
    process.env.QUANTMAIL_ISSUER = 'https://override.example.test';
    const doc2 = buildOpenIdConfiguration();
    expect(doc2.issuer).toBe('https://override.example.test');
    expect(doc2.jwks_uri).toBe('https://override.example.test/.well-known/jwks.json');
  });

  it('mints an id_token whose iss equals the advertised discovery issuer', async () => {
    delete process.env.QUANTMAIL_ISSUER;
    const svc = new OidcKeyService({}, silentLogger);
    const idToken = await svc.signIdToken(
      {
        sub: 'user-123',
        aud: 'client-abc',
        azp: 'client-abc',
        email: 'a@quantmail.in',
        email_verified: true,
        name: 'A',
        preferred_username: 'a',
        auth_time: 1_700_000_000,
      },
      { issuer: getIssuer(), expiresInSeconds: 900 },
    );

    // Verify exactly the way a discovery-reading RP would: take the issuer
    // from the discovery document and require it on the id_token.
    const jwks = await svc.getPublicJwks();
    const keyStore = jose.createLocalJWKSet(jwks);
    const { payload } = await jose.jwtVerify(idToken, keyStore, {
      issuer: String(buildOpenIdConfiguration().issuer),
      audience: 'client-abc',
    });
    expect(payload.iss).toBe('https://quantmail.in');
  });

  it('strips a trailing slash on the env issuer so endpoint URLs stay valid', () => {
    process.env.QUANTMAIL_ISSUER = 'https://quantmail.in/';
    const doc = buildOpenIdConfiguration();
    expect(doc.jwks_uri).toBe('https://quantmail.in/.well-known/jwks.json');
  });
});
