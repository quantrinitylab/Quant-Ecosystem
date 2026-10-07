// ============================================================================
// Task 2.3 — Unit tests for KMS-backed JWT resolution and key rotation
// ============================================================================
//
// Validates: Requirements 2.1 (resolve JWT_Secret from the KMS at runtime, never
// from a hardcoded/static literal) and 2.2 (after a key rotation, tokens issued
// under the previous key keep verifying until they expire, while new tokens are
// signed with the rotated active key).
//
// These run against the REAL implementations: `TokenService` (which signs/verifies
// through its injected `JwtKms`), `EnvConfigJwtKms` (the env/config-backed KMS
// provider) and `deriveKid` (the deterministic key-id derivation). The `env`
// override of `EnvConfigJwtKmsOptions` is used to drive rotation deterministically.

import { describe, it, expect } from 'vitest';
import * as jose from 'jose';
import { TokenService } from '../services/token-service';
import { EnvConfigJwtKms, deriveKid } from '../lib/jwt-kms';
import type { AuthConfig } from '../types';

const TEST_CONFIG: AuthConfig = {
  jwtSecret: 'test-secret-key-for-unit-tests-minimum-length',
  jwtRefreshSecret: 'test-refresh-secret-key-for-unit-tests',
  accessTokenExpiresIn: 900, // 15 minutes
  refreshTokenExpiresIn: 604800, // 7 days
  issuer: 'quant-test',
  audience: 'quant-test-audience',
  bcryptRounds: 10,
  maxLoginAttempts: 5,
  lockoutDuration: 900,
};

const USER = { email: 'kms@quant.app', username: 'kmsuser', role: 'user' } as const;

/** Read the `kid` from a JWT's protected header without verifying it. */
function kidOf(token: string): string | undefined {
  const header = jose.decodeProtectedHeader(token);
  return typeof header.kid === 'string' ? header.kid : undefined;
}

describe('JWT KMS resolution (Requirement 2.1)', () => {
  it('signs with the KMS-resolved active key and verifies the resulting token', async () => {
    const kms = new EnvConfigJwtKms({
      accessSecret: TEST_CONFIG.jwtSecret,
      refreshSecret: TEST_CONFIG.jwtRefreshSecret,
    });
    const service = new TokenService(TEST_CONFIG, undefined, { kms });

    const pair = await service.generateTokenPair(
      'user-kms-1',
      USER,
      ['profile:read'],
      'quantmail',
    );

    // The service can validate the token it just signed via the same KMS.
    const payload = await service.validateAccessToken(pair.accessToken);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-kms-1');
  });

  it('stamps the access token with the active key kid derived by deriveKid', async () => {
    const kms = new EnvConfigJwtKms({
      accessSecret: TEST_CONFIG.jwtSecret,
      refreshSecret: TEST_CONFIG.jwtRefreshSecret,
    });
    const service = new TokenService(TEST_CONFIG, undefined, { kms });

    const pair = await service.generateTokenPair(
      'user-kms-2',
      USER,
      ['profile:read'],
      'quantmail',
    );

    const activeKey = await kms.getActiveKey('access');
    expect(kidOf(pair.accessToken)).toBe(activeKey.kid);
    expect(kidOf(pair.accessToken)).toBe(deriveKid('access', TEST_CONFIG.jwtSecret));

    // The refresh token is stamped with the refresh key's kid (independent split).
    const refreshKey = await kms.getActiveKey('refresh');
    expect(kidOf(pair.refreshToken)).toBe(refreshKey.kid);
    expect(kidOf(pair.refreshToken)).toBe(deriveKid('refresh', TEST_CONFIG.jwtRefreshSecret));
  });

  it('resolves key material at runtime rather than from a static literal', async () => {
    // Two KMS providers configured with different secrets must yield different
    // kids — proving the signing key is resolved from the provider at runtime,
    // not captured once as a constant.
    const kmsA = new EnvConfigJwtKms({ env: { JWT_SECRET: 'secret-A-aaaaaaaaaaaaaaaaaaaaaaaa' } });
    const kmsB = new EnvConfigJwtKms({ env: { JWT_SECRET: 'secret-B-bbbbbbbbbbbbbbbbbbbbbbbb' } });

    const serviceA = new TokenService(TEST_CONFIG, undefined, { kms: kmsA });
    const serviceB = new TokenService(TEST_CONFIG, undefined, { kms: kmsB });

    const pairA = await serviceA.generateTokenPair('u', USER, ['profile:read'], 'quantmail');
    const pairB = await serviceB.generateTokenPair('u', USER, ['profile:read'], 'quantmail');

    expect(kidOf(pairA.accessToken)).not.toBe(kidOf(pairB.accessToken));

    // A token signed by provider A must NOT verify under provider B (no shared key).
    expect(await serviceB.validateAccessToken(pairA.accessToken)).toBeNull();
  });
});

describe('JWT key rotation (Requirement 2.2)', () => {
  const OLD_ACCESS = 'old-access-secret-pre-rotation-000000';
  const OLD_REFRESH = 'old-refresh-secret-pre-rotation-000000';
  const NEW_ACCESS = 'new-access-secret-post-rotation-111111';
  const NEW_REFRESH = 'new-refresh-secret-post-rotation-111111';

  // KMS state BEFORE rotation: only the old secrets are active.
  function preRotationKms(): EnvConfigJwtKms {
    return new EnvConfigJwtKms({
      env: { JWT_SECRET: OLD_ACCESS, JWT_REFRESH_SECRET: OLD_REFRESH },
    });
  }

  // KMS state AFTER rotation: new secrets are active; old secrets remain in the
  // verification set via the *_PREVIOUS env vars (the rotation grace window).
  function postRotationKms(): EnvConfigJwtKms {
    return new EnvConfigJwtKms({
      env: {
        JWT_SECRET: NEW_ACCESS,
        JWT_REFRESH_SECRET: NEW_REFRESH,
        JWT_SECRET_PREVIOUS: OLD_ACCESS,
        JWT_REFRESH_SECRET_PREVIOUS: OLD_REFRESH,
      },
    });
  }

  it('keeps tokens signed under the previous key valid until expiry after rotation', async () => {
    // 1) Issue a token under the OLD active key.
    const beforeService = new TokenService(TEST_CONFIG, undefined, { kms: preRotationKms() });
    const oldPair = await beforeService.generateTokenPair(
      'user-rot-1',
      USER,
      ['profile:read'],
      'quantmail',
    );
    expect(kidOf(oldPair.accessToken)).toBe(deriveKid('access', OLD_ACCESS));

    // 2) Rotate: new active key, old key demoted to "previous".
    const afterService = new TokenService(TEST_CONFIG, undefined, { kms: postRotationKms() });

    // 3) The old token (carrying the previous kid) STILL verifies post-rotation.
    const payload = await afterService.validateAccessToken(oldPair.accessToken);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-rot-1');
  });

  it('signs new tokens with the rotated active key (different kid from the old key)', async () => {
    const afterService = new TokenService(TEST_CONFIG, undefined, { kms: postRotationKms() });

    const newPair = await afterService.generateTokenPair(
      'user-rot-2',
      USER,
      ['profile:read'],
      'quantmail',
    );

    // New tokens carry the NEW active kid, not the previous one.
    expect(kidOf(newPair.accessToken)).toBe(deriveKid('access', NEW_ACCESS));
    expect(kidOf(newPair.accessToken)).not.toBe(deriveKid('access', OLD_ACCESS));

    // And they verify under the rotated KMS.
    const payload = await afterService.validateAccessToken(newPair.accessToken);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-rot-2');
  });

  it('rejects a token signed with the new key under the pre-rotation KMS (no new key yet)', async () => {
    const afterService = new TokenService(TEST_CONFIG, undefined, { kms: postRotationKms() });
    const newPair = await afterService.generateTokenPair(
      'user-rot-3',
      USER,
      ['profile:read'],
      'quantmail',
    );

    // A KMS that only knows the OLD key cannot verify a token signed with the NEW key.
    const beforeService = new TokenService(TEST_CONFIG, undefined, { kms: preRotationKms() });
    expect(await beforeService.validateAccessToken(newPair.accessToken)).toBeNull();
  });

  it('drops the previous key once the grace window ends, invalidating old tokens', async () => {
    // Issue under the old key, then advance to a KMS that only knows the NEW key
    // (no *_PREVIOUS) — modelling the end of the rotation grace window.
    const beforeService = new TokenService(TEST_CONFIG, undefined, { kms: preRotationKms() });
    const oldPair = await beforeService.generateTokenPair(
      'user-rot-4',
      USER,
      ['profile:read'],
      'quantmail',
    );

    const newOnlyService = new TokenService(TEST_CONFIG, undefined, {
      kms: new EnvConfigJwtKms({
        env: { JWT_SECRET: NEW_ACCESS, JWT_REFRESH_SECRET: NEW_REFRESH },
      }),
    });

    expect(await newOnlyService.validateAccessToken(oldPair.accessToken)).toBeNull();
  });

  it('allows a refresh token issued under the previous key to be redeemed after rotation', async () => {
    // generateTokenPair persists the refresh-token record (mocked Prisma store),
    // so the post-rotation service can verify (previous key) and rotate it.
    const beforeService = new TokenService(TEST_CONFIG, undefined, { kms: preRotationKms() });
    const oldPair = await beforeService.generateTokenPair(
      'user-rot-5',
      USER,
      ['profile:read'],
      'quantmail',
    );
    expect(kidOf(oldPair.refreshToken)).toBe(deriveKid('refresh', OLD_REFRESH));

    const afterService = new TokenService(TEST_CONFIG, undefined, { kms: postRotationKms() });
    const refreshed = await afterService.refreshToken(oldPair.refreshToken);

    expect(refreshed.accessToken).toBeDefined();
    // The freshly minted access token is signed with the NEW active key.
    expect(kidOf(refreshed.accessToken)).toBe(deriveKid('access', NEW_ACCESS));
  });
});
