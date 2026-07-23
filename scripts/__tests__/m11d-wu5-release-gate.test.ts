import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MemoryReleaseGateError,
  extractManifestMemoryMode,
  validateMemoryDeployMode,
  validateMemoryDeploymentManifest,
} from '../m11d-wu5-release-gate';

describe('M11d WU5 memory release gate', () => {
  it.each(['legacy', 'dual_write', 'shadow'] as const)(
    'allows the canonical non-authoritative mode %s',
    (mode) => {
      expect(validateMemoryDeployMode(mode)).toBe(mode);
    },
  );

  it.each([undefined, '', ' ', 'new', 'NEW', 'dual-write', 'SHADOW', 'chaos'])(
    'fails closed for missing, unapproved, or non-canonical value %s',
    (mode) => {
      expect(() => validateMemoryDeployMode(mode)).toThrow(MemoryReleaseGateError);
    },
  );

  it('extracts exactly one explicit manifest value', () => {
    expect(
      extractManifestMemoryMode(`
        env:
          - name: QUANTAI_MEMORY_MODE
            value: 'legacy'
      `),
    ).toBe('legacy');
    expect(() => extractManifestMemoryMode('env: []')).toThrow(/found 0/);
    expect(() =>
      extractManifestMemoryMode(`
        - name: QUANTAI_MEMORY_MODE
          value: legacy
        - name: QUANTAI_MEMORY_MODE
          value: shadow
      `),
    ).toThrow(/found 2/);
  });

  it('rejects a manifest that attempts new authority', () => {
    expect(() =>
      validateMemoryDeploymentManifest(`
        env:
          - name: QUANTAI_MEMORY_MODE
            value: 'new'
      `),
    ).toThrow(/decision is HOLD/);
  });

  it('keeps the checked-in production manifest explicitly on legacy', () => {
    const manifest = readFileSync(resolve(process.cwd(), 'infra/k8s/quantai-backend.yaml'), 'utf8');
    expect(validateMemoryDeploymentManifest(manifest)).toBe('legacy');
  });
});
