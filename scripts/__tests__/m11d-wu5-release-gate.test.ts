import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MemoryReleaseGateError,
  extractManifestMemoryMode,
  validateMemoryDeployMode,
  validateMemoryDeploymentManifest,
  validateShadowComposeOverlay,
} from '../m11d-wu5-release-gate';

describe('M11d WU5 memory release gate', () => {
  it('allows only legacy authority in production while the decision is HOLD', () => {
    expect(validateMemoryDeployMode('legacy')).toBe('legacy');
  });

  it.each([undefined, '', ' ', 'new', 'NEW', 'dual_write', 'shadow', 'SHADOW', 'chaos'])(
    'fails closed for missing or unapproved production value %s',
    (mode) => {
      expect(() => validateMemoryDeployMode(mode)).toThrow(MemoryReleaseGateError);
    },
  );

  it('extracts exactly one explicit literal manifest value', () => {
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

  it.each([
    'valueFrom:\n  secretKeyRef:\n    name: unsafe',
    'value: ${QUANTAI_MEMORY_MODE}',
    'value: &memoryMode legacy',
    'value: legacy # hidden suffix',
  ])('rejects indirect or non-canonical manifest value: %s', (value) => {
    expect(() =>
      extractManifestMemoryMode(`
        - name: QUANTAI_MEMORY_MODE
          ${value}
      `),
    ).toThrow(MemoryReleaseGateError);
  });

  it('requires the canary overlay mode to be explicit with no default', () => {
    expect(() =>
      validateShadowComposeOverlay(
        'environment:\n  QUANTAI_MEMORY_MODE: ${QUANTAI_MEMORY_MODE:?mode required}',
      ),
    ).not.toThrow();
    expect(() =>
      validateShadowComposeOverlay(
        'environment:\n  QUANTAI_MEMORY_MODE: ${QUANTAI_MEMORY_MODE:-shadow}',
      ),
    ).toThrow(/without a default/);
    expect(() => validateShadowComposeOverlay('environment: {}')).toThrow(/found 0/);
  });

  it('keeps checked-in production and canary configuration fail-closed', () => {
    const production = readFileSync(
      resolve(process.cwd(), 'infra/k8s/quantai-backend.yaml'),
      'utf8',
    );
    const overlay = readFileSync(resolve(process.cwd(), 'docker-compose.shadow.yml'), 'utf8');
    expect(validateMemoryDeploymentManifest(production)).toBe('legacy');
    expect(() => validateShadowComposeOverlay(overlay)).not.toThrow();
  });

  it('blocks AWS and image push until memory preflight succeeds', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/deploy.yml'), 'utf8');
    const preflight = workflow.indexOf('  memory-release-preflight:');
    const deploy = workflow.indexOf('  build-deploy:');
    const needs = workflow.indexOf('needs: memory-release-preflight', deploy);
    const aws = workflow.indexOf('Configure AWS credentials', deploy);
    const push = workflow.indexOf('Build & push image', deploy);

    const preflightSection = workflow.slice(preflight, deploy);
    const deploySection = workflow.slice(deploy);

    expect(preflight).toBeGreaterThan(-1);
    expect(deploy).toBeGreaterThan(preflight);
    expect(needs).toBeGreaterThan(deploy);
    expect(needs).toBeLessThan(aws);
    expect(needs).toBeLessThan(push);
    expect(preflightSection).not.toContain('id-token: write');
    expect(deploySection).toContain('id-token: write');
  });
});
