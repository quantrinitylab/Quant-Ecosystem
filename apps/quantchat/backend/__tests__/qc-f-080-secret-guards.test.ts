// QC-F-080 — staging JWT secret guard bypass.
//
// Defect: every production secret guard keyed on the exact env name
// 'production', while the staging helm charts deploy with NODE_ENV=staging.
// A staging instance with JWT_SECRET missing/weak therefore booted on
// public, committed fallback strings — REST on
// 'dev-secret-change-in-production', WebSocket on a second public string —
// making every session token forgeable. Fix: one deny-local predicate
// (server-core `requiresRealSecret`) at all three QuantChat guard sites.
//
// Cases 5–8 (getConfig) and 9–11 (WS getJwtSecret) from the specialist
// brief, plus the case-14 static pin for the backend guard sites. Negative
// control: on the pre-fix code the staging cases FAIL (getConfig returned
// the fallback, getJwtSecret returned the WS fallback / the raw placeholder).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { InsecureSecretError } from '@quant/server-core';
import { getConfig } from '../app';
import { getJwtSecret } from '../routes/websocket';

const STRONG = 'K7$n2ZqR9wLm4XbV8pT1cY6hJ3fD5gQs';
const REST_FALLBACK = 'dev-secret-change-in-production';
const WS_FALLBACK = 'dev-only-insecure-jwt-secret-not-for-production-use-000';

const ENV_KEYS = ['NODE_ENV', 'JWT_SECRET', 'VOICE_BOT_SECRET', 'LIVEKIT_API_SECRET'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  // Isolate the JWT guard from getConfig's (already staging-aware)
  // VOICE_BOT/LIVEKIT presence guard.
  process.env['VOICE_BOT_SECRET'] = 'test-voice-bot-secret';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe('QC-F-080 getConfig JWT guard', () => {
  it('case 5: staging + JWT_SECRET missing throws, naming the env', () => {
    process.env['NODE_ENV'] = 'staging';
    expect(() => getConfig()).toThrow(/JWT_SECRET environment variable is required in staging/);
  });

  it('case 6: staging + JWT_SECRET set returns it verbatim', () => {
    process.env['NODE_ENV'] = 'staging';
    process.env['JWT_SECRET'] = STRONG;
    const config = getConfig();
    expect(config.jwtSecret).toBe(STRONG);
    expect(config.env).toBe('staging');
  });

  it('case 7: production pins hold (missing throws, set passes)', () => {
    process.env['NODE_ENV'] = 'production';
    expect(() => getConfig()).toThrow(/required in production/);
    process.env['JWT_SECRET'] = STRONG;
    expect(getConfig().jwtSecret).toBe(STRONG);
  });

  it('case 8: local pins hold (development/test/unset keep the dev fallback)', () => {
    process.env['NODE_ENV'] = 'development';
    expect(getConfig().jwtSecret).toBe(REST_FALLBACK);
    process.env['NODE_ENV'] = 'test';
    expect(getConfig().jwtSecret).toBe(REST_FALLBACK);
    delete process.env['NODE_ENV'];
    const config = getConfig();
    expect(config.env).toBe('development');
    expect(config.jwtSecret).toBe(REST_FALLBACK);
  });
});

describe('QC-F-080 websocket getJwtSecret', () => {
  it('case 9: staging + JWT_SECRET missing throws instead of using the WS fallback', () => {
    process.env['NODE_ENV'] = 'staging';
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET environment variable is required in staging/);
  });

  it('case 10: deployed envs reject both public placeholder strings by value', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['JWT_SECRET'] = WS_FALLBACK;
    expect(() => getJwtSecret()).toThrow(InsecureSecretError);
    process.env['NODE_ENV'] = 'staging';
    process.env['JWT_SECRET'] = REST_FALLBACK;
    expect(() => getJwtSecret()).toThrow(InsecureSecretError);
  });

  it('case 11: controls — staging + strong secret passes; local missing keeps warn + fallback', () => {
    process.env['NODE_ENV'] = 'staging';
    process.env['JWT_SECRET'] = STRONG;
    expect(getJwtSecret()).toBe(STRONG);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env['NODE_ENV'] = 'development';
    delete process.env['JWT_SECRET'];
    expect(getJwtSecret()).toBe(WS_FALLBACK);
    expect(warn).toHaveBeenCalled();
  });
});

describe('QC-F-080 static pin (brief case 14, backend half)', () => {
  it('no exact-production-only JWT guard remains at the backend guard sites', () => {
    const appSource = readFileSync(fileURLToPath(new URL('../app.ts', import.meta.url)), 'utf8');
    const wsSource = readFileSync(
      fileURLToPath(new URL('../routes/websocket.ts', import.meta.url)),
      'utf8',
    );
    expect(appSource).not.toContain("env === 'production' && !process.env['JWT_SECRET']");
    expect(appSource).toContain('requiresRealSecret(env)');
    expect(wsSource).not.toContain("process.env.NODE_ENV === 'production'");
    expect(wsSource).toContain('assertProductionSecret(secret');
  });
});
