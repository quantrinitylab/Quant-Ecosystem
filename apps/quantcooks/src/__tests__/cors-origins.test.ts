// ============================================================================
// QuantCooks — CORS trusted-origin allowlist test (P0-2).
//
// Root cause of the 403 UNTRUSTED_ORIGIN on password login: the identity
// backend's requireTrustedOrigin checks CORS_ORIGINS, and the QuantCooks
// production origin was missing from infra/helm/quant-platform/values-staging.yaml.
// This test pins the fix at the source of truth (the values file) so the origin
// can never silently drop out again.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// apps/quantcooks/src/__tests__ -> repo root
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const VALUES_FILE = resolve(REPO_ROOT, 'infra', 'helm', 'quant-platform', 'values-staging.yaml');

function readCorsOrigins(): string[] {
  const text = readFileSync(VALUES_FILE, 'utf8');
  const match = text.match(/^\s*CORS_ORIGINS:\s*'([^']*)'/m);
  expect(match, `CORS_ORIGINS not found in ${VALUES_FILE}`).not.toBeNull();
  return match![1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

describe('CORS trusted origins (values-staging.yaml)', () => {
  it('allow-lists the production QuantCooks origin', () => {
    const origins = readCorsOrigins();
    expect(origins).toContain('https://quantcooks.quantrinity.in');
  });

  it('keeps the flagship and sibling-app origins intact', () => {
    const origins = readCorsOrigins();
    for (const expected of [
      'https://quantmail.in',
      'https://quantchat.quantrinity.in',
      'https://quantai.quantrinity.in',
    ]) {
      expect(origins).toContain(expected);
    }
  });

  it('entries are clean https origins (no trailing slash, no duplicates)', () => {
    const origins = readCorsOrigins();
    for (const origin of origins) {
      expect(origin).toMatch(/^https:\/\/[a-z0-9.-]+$/i);
      expect(origin.endsWith('/')).toBe(false);
    }
    expect(new Set(origins).size).toBe(origins.length);
  });
});
