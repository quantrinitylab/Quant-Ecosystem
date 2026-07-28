// @vitest-environment node
// ============================================================================
// Feature: quantmail-superhub, Phase-1 security regression (HARD-GATE assertions)
// Task 4 — "Write Phase-1 security regression suite (HARD-GATE assertions)"
// ============================================================================
//
// This suite is the consolidated Phase-1 HARD GATE: it asserts that each
// Phase-1 vulnerability class (V1–V9) is closed. It is the regression net that
// must stay green before any later pillar is enabled (Requirement 24.1).
//
//   V1  No hardcoded / weak JWT secret reachable in production        (Req 2.1)
//   V2  No reachable `@simulated` cryptography code path              (Req 2.3)
//   V3  PKCE rejects a mismatched code_verifier at the token endpoint (Req 1.2, 1.3)
//   V4  Non-allowlisted redirect_uri rejected at /oauth/authorize     (Req 1.5)
//   V5  Consent-screen output is escaped (reflected-XSS closed)       (Req 1.x)
//   V6  redirect_uri rebinding enforced at the token exchange         (Req 1.4)
//   V7  Authorization-code replay (non-single-use) rejected           (Req 1.6)
//   V8  No plaintext private-key persistence (KMS reference only)     (Req 2.4)
//   V9  AI engine fails closed (no silent mock) in production         (Req 3.1)
//
// _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.3, 2.4, 3.1, 24.1_
//
// STRATEGY
//   - Behavioral classes (V3–V7, V9) are asserted against the REAL code paths:
//       * V3–V7 boot the REAL `oauthRoutes` on a bare Fastify app and mock only
//         the deep `@quant/auth` specifiers the route consumes (prisma,
//         secure-random, secrets, token-service) — exactly as the existing
//         oauth test suites do — while using the REAL PKCE module so the
//         SHA-256 transform is genuinely exercised.
//       * V9 runs the REAL `@quant/ai` `UnifiedAIService` / `ImageGenerationService`
//         with no provider configured and fail-closed mode forced on, asserting
//         an explicit typed error is raised instead of a simulated payload.
//   - Static-analysis classes (V1, V2, V8) grep the relevant source files and
//     assert the dangerous pattern is ABSENT (no literal JWT-secret fallback,
//     no `@simulated` crypto path, no plaintext private-key field), and that
//     the hardened replacement is PRESENT (KMS resolution, real node:crypto,
//     KeyVault references).

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Mocks for the REAL oauthRoutes (V3–V7). Only the deep @quant/auth specifiers
// the route imports are mocked; the PKCE module is left REAL (imported below).
// ---------------------------------------------------------------------------
vi.mock('@quant/auth/lib/prisma', () => {
  const p = {
    oAuthClient: { findUnique: vi.fn(), create: vi.fn() },
    oAuthConsent: { findUnique: vi.fn(), upsert: vi.fn() },
    authorizationCode: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  };
  return { default: p, prisma: p };
});

vi.mock('@quant/auth/crypto/secure-random', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}mock_${Math.random().toString(36).slice(2, 8)}`),
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: vi.fn(() => 'test-jwt-secret'),
  getJwtRefreshSecret: vi.fn(() => 'test-refresh-secret'),
}));

const generateTokenPair = vi.fn(async () => ({
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 900,
}));

vi.mock('@quant/auth/services/token-service', () => {
  class MockTokenService {
    generateTokenPair = generateTokenPair;
    async validateAccessToken(token: string) {
      return token ? { id: 'user-1', sub: 'user-1', email: 'user@test.com' } : null;
    }
    async refreshToken() {
      return { access_token: 'a', refresh_token: 'r' };
    }
    async revokeToken() {
      return { revoked: true };
    }
  }
  return { TokenService: MockTokenService };
});

// REAL PKCE crypto + the route under test.
import { generateCodeVerifier, generateCodeChallenge } from '@quant/auth/crypto/pkce';
import { oauthRoutes } from '../routes/oauth';
import prismaDefaultImport from '@quant/auth/lib/prisma';

// REAL @quant/ai fail-closed engine (V9).
import {
  UnifiedAIService,
  ImageGenerationService,
  AIProviderUnavailableError,
  isFailClosedMode,
} from '@quant/ai';

const db = vi.mocked(
  prismaDefaultImport as unknown as {
    oAuthClient: { findUnique: ReturnType<typeof vi.fn> };
    oAuthConsent: { findUnique: ReturnType<typeof vi.fn> };
    authorizationCode: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    user: { findUnique: ReturnType<typeof vi.fn> };
  },
);

// ---------------------------------------------------------------------------
// Repo-root-relative source reads for the static-analysis classes (V1, V2, V8).
// ---------------------------------------------------------------------------
const HERE = dirname(fileURLToPath(import.meta.url)); // apps/quantmail/backend/__tests__
const REPO_ROOT = resolve(HERE, '../../../../'); // -> repo root (Quant-Ecosystem)
const readSource = (rel: string): string => readFileSync(resolve(REPO_ROOT, rel), 'utf-8');

const SRC = {
  secrets: 'packages/auth/src/lib/secrets.ts',
  tokenService: 'packages/auth/src/services/token-service.ts',
  jwtKms: 'packages/auth/src/lib/jwt-kms.ts',
  pgpCrypto: 'packages/encryption/src/pgp-crypto.ts',
  keyVault: 'packages/encryption/src/key-vault.ts',
  pgpService: 'apps/quantmail/backend/services/pgp-encryption.service.ts',
  e2eeRoute: 'apps/quantmail/backend/routes/e2ee.ts',
} as const;

/**
 * Strip line + block comments so static assertions target EXECUTABLE code only.
 * The hardened sources legitimately *mention* `@simulated` in their
 * de-simulation comments ("no longer any reachable @simulated path"); what V2
 * must prove is that no such marker survives in the actual code path.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ---------------------------------------------------------------------------
// Shared Fastify harness for the OAuth behavioral classes (V3–V7).
// ---------------------------------------------------------------------------
let app: FastifyInstance;
const futureExpiry = () => new Date(Date.now() + 5 * 60 * 1000);

async function exchange(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/oauth/token', payload });
}
async function authorize(query: Record<string, unknown>) {
  return app.inject({
    method: 'GET',
    url: '/oauth/authorize',
    query: query as Record<string, string>,
    headers: { authorization: 'Bearer valid-access-token' },
  });
}

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(oauthRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({
    id: 'user-1',
    email: 'user@test.com',
    username: 'tester',
    role: 'USER',
  } as never);
});

// ===========================================================================
// V1 — No hardcoded / weak JWT secret reachable in production (Req 2.1)
// ===========================================================================
describe('V1 — no hardcoded/weak JWT secret reachable in production (Req 2.1)', () => {
  it('secrets.ts throws (never returns a literal) when the secret is missing/weak in production', () => {
    const src = readSource(SRC.secrets);
    // The production branch is gated and FAILS rather than falling back to a literal.
    expect(src).toContain("process.env.NODE_ENV === 'production'");
    expect(/throw new Error\([^)]*must be set/.test(src)).toBe(true);
    expect(src).toMatch(/at least 32 characters/);
    expect(src).toContain('KNOWN_INSECURE_DEFAULTS.includes(value)');
    // Every dev literal must carry the standard marker. The one legacy compose
    // default remains explicitly allowlisted here because production rejects it
    // through KNOWN_INSECURE_DEFAULTS before returning any secret.
    for (const literal of src.match(/'dev-only[^']*'/g) ?? []) {
      expect(literal).toMatch(/not-for-production|^'dev-only-change-me-in-production!!!'$/);
    }
  });

  it('TokenService resolves keys via the KMS at runtime and embeds no inline secret literal', () => {
    const src = readSource(SRC.tokenService);
    // Keys come from the KMS port, not a captured static literal.
    expect(src).toContain('jwt-kms');
    expect(src).toMatch(/EnvConfigJwtKms/);
    expect(src).toMatch(/this\.kms\.getActiveKey/);
    expect(src).toMatch(/getVerificationKeys|getKeyById/);
    // No inline secret literal assigned to a jwtSecret-like field.
    expect(/jwtSecret\s*[:=]\s*['"][^'"]{6,}['"]/.test(src)).toBe(false);
  });

  it('jwt-kms.ts provides runtime-resolved, rotatable key versions (active + previous)', () => {
    const src = readSource(SRC.jwtKms);
    expect(src).toMatch(/deriveKid/);
    expect(src).toMatch(/class EnvConfigJwtKms/);
    expect(src).toMatch(/class VaultJwtKms/);
    // Rotation grace window: a previous key is honored for verification.
    expect(src).toMatch(/PREVIOUS|previous/);
  });
});

// ===========================================================================
// V2 — No reachable `@simulated` cryptography path (Req 2.3)
// ===========================================================================
describe('V2 — no reachable @simulated crypto path (Req 2.3)', () => {
  it('no Phase-1 crypto source contains a reachable @simulated marker (comments excluded)', () => {
    for (const rel of [SRC.pgpCrypto, SRC.keyVault, SRC.pgpService, SRC.e2eeRoute]) {
      expect(stripComments(readSource(rel))).not.toContain('@simulated');
    }
  });

  it('pgp-crypto.ts uses real node:crypto primitives (RSA-OAEP + AES-256-GCM + RSA-SHA256)', () => {
    const src = readSource(SRC.pgpCrypto);
    expect(src).toContain("from 'node:crypto'");
    expect(src).toMatch(/generateKeyPairSync/);
    expect(src).toMatch(/publicEncrypt/);
    expect(src).toMatch(/privateDecrypt/);
    expect(src).toContain('aes-256-gcm');
    expect(src).toMatch(/RSA_PKCS1_OAEP_PADDING/);
    // Real signature verification (cryptoVerify) — NOT a trivially-true stub,
    // and NOT a hand-rolled XOR "cipher".
    expect(src).toMatch(/cryptoVerify|verify\(/);
    expect(/charCodeAt\([^)]*\)\s*\^/.test(src)).toBe(false);
  });

  it('pgp-encryption.service.ts routes through @quant/encryption real primitives', () => {
    const src = stripComments(readSource(SRC.pgpService));
    expect(src).toContain("from '@quant/encryption'");
    expect(src).toMatch(/PgpCrypto/);
    expect(src).not.toContain('@simulated');
  });
});

// ===========================================================================
// V3 — PKCE rejects a mismatched verifier at the token endpoint (Req 1.2, 1.3)
// ===========================================================================
describe('V3 — PKCE rejects a mismatched verifier (Req 1.2, 1.3)', () => {
  it('rejects with NO tokens when SHA256(code_verifier) !== stored code_challenge', async () => {
    const challenge = await generateCodeChallenge(generateCodeVerifier());
    db.authorizationCode.findUnique.mockResolvedValue({
      code: 'ac_v3_mismatch',
      userId: 'user-1',
      scopes: ['openid'],
      redirectUri: 'https://app.example.com/cb',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      expiresAt: futureExpiry(),
    } as never);
    db.authorizationCode.deleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'ac_v3_mismatch',
      redirect_uri: 'https://app.example.com/cb',
      code_verifier: generateCodeVerifier(), // a different, non-matching verifier
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_grant' });
    expect(generateTokenPair).not.toHaveBeenCalled();
    // The code is NOT consumed on a failed PKCE check (a legitimate retry can still succeed).
    expect(db.authorizationCode.deleteMany).not.toHaveBeenCalled();
  });

  it('grants tokens for a matching verifier (positive control)', async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    db.authorizationCode.findUnique.mockResolvedValue({
      code: 'ac_v3_ok',
      userId: 'user-1',
      scopes: ['openid'],
      redirectUri: 'https://app.example.com/cb',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      expiresAt: futureExpiry(),
    } as never);
    db.authorizationCode.deleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'ac_v3_ok',
      redirect_uri: 'https://app.example.com/cb',
      code_verifier: verifier,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ access_token: 'mock-access-token' });
    expect(generateTokenPair).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// V4 — Non-allowlisted redirect_uri rejected at /oauth/authorize (Req 1.5)
// ===========================================================================
describe('V4 — non-allowlisted redirect_uri rejected (Req 1.5)', () => {
  it('rejects a redirect_uri not in the client Redirect_Allowlist and mints no code', async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'client_abc',
      redirectUris: ['https://app.example.com/callback'],
    } as never);

    const res = await authorize({
      client_id: 'client_abc',
      redirect_uri: 'https://attacker.example.com/callback',
      response_type: 'code',
      scope: 'openid',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid redirect_uri',
    });
    expect(db.authorizationCode.create).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// V5 — Consent-screen output is escaped (reflected-XSS closed) (Req 1.x)
// ===========================================================================
describe('V5 — consent-screen output is HTML-escaped (reflected XSS closed)', () => {
  it('escapes attacker-controlled scope/state so no live markup is reflected', async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'client_abc',
      redirectUris: ['https://app.example.com/callback'],
    } as never);
    // No prior consent => render the consent screen (the reflection surface).
    db.oAuthConsent.findUnique.mockResolvedValue(null as never);

    const res = await authorize({
      client_id: 'client_abc',
      redirect_uri: 'https://app.example.com/callback',
      response_type: 'code',
      scope: 'openid <script>alert(1)</script>',
      state: '"><img src=x onerror=alert(1)>',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    const body = res.body;
    // Dangerous raw markup MUST NOT appear...
    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).not.toContain('<img src=x onerror=alert(1)>');
    // ...it must be HTML-entity-escaped instead.
    expect(body).toContain('&lt;script&gt;');
    expect(body).toContain('&lt;img');
  });
});

// ===========================================================================
// V6 — redirect_uri rebinding enforced at the token exchange (Req 1.4)
// ===========================================================================
describe('V6 — redirect_uri rebinding enforced at exchange (Req 1.4)', () => {
  it('rejects with NO tokens when the exchange redirect_uri differs from the bound value', async () => {
    db.authorizationCode.findUnique.mockResolvedValue({
      code: 'ac_v6',
      userId: 'user-1',
      scopes: ['openid'],
      redirectUri: 'https://app.example.com/callback',
      codeChallenge: null,
      codeChallengeMethod: null,
      expiresAt: futureExpiry(),
    } as never);
    db.authorizationCode.deleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'ac_v6',
      redirect_uri: 'https://attacker.example.com/callback',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_grant' });
    expect(generateTokenPair).not.toHaveBeenCalled();
    // Not consumed on a failed redirect check.
    expect(db.authorizationCode.deleteMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// V7 — Authorization-code replay (non-single-use) rejected (Req 1.6)
// ===========================================================================
describe('V7 — auth-code replay rejected / single-use codes (Req 1.6)', () => {
  it('first exchange succeeds; replay of the same code is rejected with no tokens', async () => {
    db.authorizationCode.findUnique.mockResolvedValue({
      code: 'ac_v7',
      userId: 'user-1',
      scopes: ['openid'],
      redirectUri: 'https://app.example.com/callback',
      codeChallenge: null,
      codeChallengeMethod: null,
      expiresAt: futureExpiry(),
    } as never);
    // Atomic single-use guard: first delete wins (count 1), replay loses (count 0).
    db.authorizationCode.deleteMany
      .mockResolvedValueOnce({ count: 1 } as never)
      .mockResolvedValueOnce({ count: 0 } as never);

    const first = await exchange({
      grant_type: 'authorization_code',
      code: 'ac_v7',
      redirect_uri: 'https://app.example.com/callback',
    });
    expect(first.statusCode).toBe(200);
    expect(generateTokenPair).toHaveBeenCalledTimes(1);

    generateTokenPair.mockClear();
    const replay = await exchange({
      grant_type: 'authorization_code',
      code: 'ac_v7',
      redirect_uri: 'https://app.example.com/callback',
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toMatchObject({ error: 'invalid_grant' });
    expect(generateTokenPair).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// V8 — No plaintext private-key persistence (KMS reference only) (Req 2.4)
// ===========================================================================
describe('V8 — no plaintext private-key persistence (Req 2.4)', () => {
  it('the persisted PGP key record holds a KMS reference, never plaintext private-key material', () => {
    const src = stripComments(readSource(SRC.pgpService));
    // Persisted shape carries a reference field, not raw key material.
    expect(src).toMatch(/privateKeyRef/);
    // No plaintext private-key field is modeled/persisted on the record.
    expect(/privateKey:\s*z\.string\(\)/.test(src)).toBe(false);
    // The private PEM is handed to the vault; only its reference is retained.
    expect(src).toMatch(/vault\.store\(\s*material\.privateKeyPem/);
    // The object stored in the in-memory map is the reference-bearing KeyPair,
    // and the keyPair literal exposes `privateKeyRef` (never a raw pem field).
    expect(/privateKeyPem:/.test(src)).toBe(false);
  });

  it('key-vault.ts persists only opaque kms:// references (no key bytes in the locator)', () => {
    const src = readSource(SRC.keyVault);
    expect(src).toContain("'kms://'");
    expect(src).toMatch(/export function isKeyRef/);
    expect(src).toMatch(/store\(/);
  });

  it('the E2EE relay route accepts public/ciphertext fields only (strict, no privateKey/plaintext)', () => {
    const src = readSource(SRC.e2eeRoute);
    expect(src).toContain('.strict()');
    expect(/privateKey:/.test(src)).toBe(false);
    expect(/plaintext:/.test(src)).toBe(false);
  });
});

// ===========================================================================
// V9 — AI engine fails closed (no silent mock) in production (Req 3.1)
// ===========================================================================
describe('V9 — AI engine fails closed in production (Req 3.1)', () => {
  describe('fail-closed mode forced on (production-equivalent)', () => {
    beforeEach(() => {
      vi.stubEnv('OPENAI_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('GOOGLE_API_KEY', '');
      vi.stubEnv('QUANT_AI_FAIL_CLOSED', 'true');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('isFailClosedMode() reports closed when the flag is forced on', () => {
      expect(isFailClosedMode()).toBe(true);
    });

    it('UnifiedAIService.generateText raises an explicit typed error, not a mock payload', async () => {
      const service = new UnifiedAIService();
      await expect(service.generateText('hello there')).rejects.toBeInstanceOf(
        AIProviderUnavailableError,
      );
      // Carries the stable machine-readable code for telemetry/callers.
      await service.generateText('hello there').catch((err) => {
        expect((err as AIProviderUnavailableError).code).toBe('AI_PROVIDER_UNAVAILABLE');
      });
    });

    it('UnifiedAIService.moderateContent fails closed rather than fabricating a "safe" verdict', async () => {
      const service = new UnifiedAIService();
      await expect(service.moderateContent('some text')).rejects.toBeInstanceOf(
        AIProviderUnavailableError,
      );
    });

    it('ImageGenerationService.generate raises an explicit error instead of a placeholder', async () => {
      const service = new ImageGenerationService();
      await expect(service.generate({ prompt: 'a cat' }, 'user-1')).rejects.toBeInstanceOf(
        AIProviderUnavailableError,
      );
    });
  });

  describe('non-production control (legacy dev mock fallback preserved)', () => {
    beforeEach(() => {
      vi.stubEnv('OPENAI_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('GOOGLE_API_KEY', '');
      vi.stubEnv('QUANT_AI_FAIL_CLOSED', 'false');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('does NOT fail closed in dev — confirming V9 is a production-gated guard, not unconditional', async () => {
      expect(isFailClosedMode()).toBe(false);
      const service = new UnifiedAIService();
      const res = await service.generateText('hello there');
      expect(typeof res.content).toBe('string');
      expect(res.content.length).toBeGreaterThan(0);
    });
  });
});
