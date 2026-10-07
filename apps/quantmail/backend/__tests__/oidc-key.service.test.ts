// @vitest-environment node
// ============================================================================
// QuantMail — OIDC key service tests (asymmetric JWKS + id_token)
// ============================================================================
//
// Proves the contract relying parties depend on: QuantMail publishes a real
// RS256 public JWK at the JWKS endpoint, and the id_token it signs verifies
// against that published key. Also proves the production property that a key
// provided via env is stable across instances (so a token signed by one
// QuantMail replica verifies against the JWKS served by another).

import { describe, it, expect } from 'vitest';
import * as jose from 'jose';
import { OidcKeyService } from '../services/oidc-key.service';

const silentLogger = { warn: () => {} };

describe('OidcKeyService — JWKS', () => {
  it('publishes a single RS256 signing JWK with a stable kid', async () => {
    const svc = new OidcKeyService({}, silentLogger);
    const jwks = await svc.getPublicJwks();

    expect(jwks.keys).toHaveLength(1);
    const [key] = jwks.keys;
    expect(key.kty).toBe('RSA');
    expect(key.use).toBe('sig');
    expect(key.alg).toBe('RS256');
    expect(typeof key.kid).toBe('string');
    expect((key.kid as string).length).toBeGreaterThan(0);
    // Public key only — private RSA parameters must never be published.
    expect(key.d).toBeUndefined();
    expect(key.p).toBeUndefined();
    expect(key.q).toBeUndefined();

    // kid is stable across calls (cached key).
    const jwks2 = await svc.getPublicJwks();
    expect(jwks2.keys[0].kid).toBe(key.kid);
  });
});

describe('OidcKeyService — id_token', () => {
  it('signs an id_token that verifies against the published JWKS', async () => {
    const svc = new OidcKeyService({}, silentLogger);

    const idToken = await svc.signIdToken(
      {
        sub: 'user-123',
        aud: 'client-abc',
        azp: 'client-abc',
        nonce: 'n-once-xyz',
        email: 'alice@quantmail.com',
        email_verified: true,
        name: 'Alice',
        preferred_username: 'alice',
        auth_time: 1_700_000_000,
      },
      { issuer: 'https://quantmail.test', expiresInSeconds: 900 },
    );

    const jwks = await svc.getPublicJwks();
    const keyStore = jose.createLocalJWKSet(jwks);
    const { payload, protectedHeader } = await jose.jwtVerify(idToken, keyStore, {
      issuer: 'https://quantmail.test',
      audience: 'client-abc',
    });

    expect(protectedHeader.alg).toBe('RS256');
    expect(protectedHeader.kid).toBe(jwks.keys[0].kid);
    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('alice@quantmail.com');
    expect(payload.email_verified).toBe(true);
    expect(payload.preferred_username).toBe('alice');
    expect(payload.nonce).toBe('n-once-xyz');
    expect(payload.azp).toBe('client-abc');
    expect(payload.auth_time).toBe(1_700_000_000);
    expect(typeof payload.exp).toBe('number');
  });

  it('rejects an id_token verified against a different key (signature is real)', async () => {
    const signer = new OidcKeyService({}, silentLogger);
    const other = new OidcKeyService({}, silentLogger);

    const idToken = await signer.signIdToken(
      { sub: 'u1', aud: 'c1' },
      { issuer: 'https://quantmail.test', expiresInSeconds: 900 },
    );

    const otherJwks = jose.createLocalJWKSet(await other.getPublicJwks());
    await expect(jose.jwtVerify(idToken, otherJwks)).rejects.toThrow();
  });
});

describe('OidcKeyService — production env key (multi-instance)', () => {
  it('uses an env-provided PKCS#8 key so tokens verify across instances', async () => {
    // A persistent key shared by every replica in production.
    const { privateKey } = await jose.generateKeyPair('RS256', { extractable: true });
    const pem = await jose.exportPKCS8(privateKey);
    const env = { QUANTMAIL_OIDC_PRIVATE_KEY: pem } as NodeJS.ProcessEnv;

    const instanceA = new OidcKeyService(env, silentLogger);
    const instanceB = new OidcKeyService(env, silentLogger);

    // Sign on instance A...
    const idToken = await instanceA.signIdToken(
      { sub: 'u-shared', aud: 'c-shared' },
      { issuer: 'https://quantmail.test', expiresInSeconds: 900 },
    );

    // ...verify against instance B's JWKS (different process, same key).
    const jwksA = await instanceA.getPublicJwks();
    const jwksB = await instanceB.getPublicJwks();
    expect(jwksB.keys[0].kid).toBe(jwksA.keys[0].kid); // same key => same kid

    const keyStoreB = jose.createLocalJWKSet(jwksB);
    const { payload } = await jose.jwtVerify(idToken, keyStoreB, {
      issuer: 'https://quantmail.test',
      audience: 'c-shared',
    });
    expect(payload.sub).toBe('u-shared');
  });
});
