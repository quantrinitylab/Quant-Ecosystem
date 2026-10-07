// Production-guard tests for secrets (reviewer finding: the docker-compose
// default is 35 chars and previously PASSED the production length check).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getJwtSecret } from '../lib/secrets';

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved['NODE_ENV'] = process.env['NODE_ENV'];
  saved['JWT_SECRET'] = process.env['JWT_SECRET'];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('requireSecret production guard', () => {
  it('rejects missing/short secrets in production', () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['JWT_SECRET'];
    expect(() => getJwtSecret()).toThrow(/at least 32 characters/);
  });

  it('rejects the KNOWN docker-compose default even though it is 35 chars', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['JWT_SECRET'] = 'dev-only-change-me-in-production!!!';
    expect(() => getJwtSecret()).toThrow(/known development default/);
  });

  it('accepts a real 32+ char secret in production', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['JWT_SECRET'] = 'a'.repeat(48);
    expect(getJwtSecret()).toBe('a'.repeat(48));
  });

  it('falls back with a warning outside production', () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['JWT_SECRET'];
    expect(getJwtSecret()).toContain('dev-only');
  });
});
