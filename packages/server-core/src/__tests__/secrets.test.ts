import { describe, expect, it } from 'vitest';
import {
  assertProductionSecret,
  InsecureSecretError,
  INSECURE_DEV_JWT_SECRET,
  MIN_PRODUCTION_SECRET_LENGTH,
} from '../secrets';

const opts = { name: 'JWT_SECRET' } as const;
const STRONG = 'K7$n2ZqR9wLm4XbV8pT1cY6hJ3fD5gQs';

describe('assertProductionSecret', () => {
  it('accepts a strong secret and returns it trimmed', () => {
    expect(assertProductionSecret(`  ${STRONG}  `, opts)).toBe(STRONG);
    expect(STRONG.length).toBeGreaterThanOrEqual(MIN_PRODUCTION_SECRET_LENGTH);
  });

  it('rejects a missing value', () => {
    expect(() => assertProductionSecret(undefined, opts)).toThrow(/JWT_SECRET is not set/);
  });

  it('rejects a blank value', () => {
    expect(() => assertProductionSecret('   ', opts)).toThrow(InsecureSecretError);
  });

  it('rejects the committed development default', () => {
    expect(() => assertProductionSecret(INSECURE_DEV_JWT_SECRET, opts)).toThrow(
      /published development placeholder/,
    );
  });

  it('rejects a long placeholder that would have passed a length-only check', () => {
    const longPlaceholder = `${INSECURE_DEV_JWT_SECRET}-v2`;
    expect(longPlaceholder.length).toBeGreaterThanOrEqual(MIN_PRODUCTION_SECRET_LENGTH);
    expect(() => assertProductionSecret(longPlaceholder, opts)).toThrow(/looks like a placeholder/);
  });

  it('rejects other common placeholders regardless of case', () => {
    for (const value of ['ChangeMe', 'SECRET', 'your-secret-here', 'replace-me']) {
      expect(() => assertProductionSecret(value, opts)).toThrow(InsecureSecretError);
    }
  });

  it('rejects a short but otherwise unique secret', () => {
    expect(() => assertProductionSecret('K7$n2ZqR9wLm', opts)).toThrow(/at least 32/);
  });

  it('names the variable and the provisioning source so a crash loop is diagnosable', () => {
    try {
      assertProductionSecret(undefined, {
        name: 'OWNER_SECRET',
        provisionedBy: 'External Secrets key quant/trinity',
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InsecureSecretError);
      const insecure = error as InsecureSecretError;
      expect(insecure.secretName).toBe('OWNER_SECRET');
      expect(insecure.message).toContain('[FATAL]');
      expect(insecure.message).toContain('quant/trinity');
    }
  });
});
