// ============================================================================
// Provider config - Meta entry + provider id allow-list
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getProviderConfig,
  hasAnyProvider,
  listProviderIds,
} from '../config/providers';

describe('provider config (meta-first)', () => {
  beforeEach(() => {
    vi.stubEnv('META_API_KEY', '');
    vi.stubEnv('META_AI_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('GOOGLE_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lists meta first in the provider id allow-list', () => {
    const ids = listProviderIds();
    expect(ids[0]).toBe('meta');
    expect(ids).toEqual(['meta', 'openai', 'anthropic', 'google', 'openrouter']);
  });

  it('exposes the meta config with the right models and env var', () => {
    const config = getProviderConfig('meta');
    expect(config).toBeDefined();
    expect(config!.apiKeyEnvVar).toBe('META_API_KEY');
    expect(config!.models).toContain('muse-spark-1.3');
  });

  it('hasAnyProvider() is true with only META_API_KEY set', () => {
    vi.stubEnv('META_API_KEY', 'test-meta-key');
    expect(hasAnyProvider()).toBe(true);
  });

  it('honors the META_AI_API_KEY fallback like the engine routing does', () => {
    // ?? semantics: only an UNSET META_API_KEY falls through (empty string does not).
    delete process.env['META_API_KEY'];
    vi.stubEnv('META_AI_API_KEY', 'legacy-meta-key');
    expect(hasAnyProvider()).toBe(true);
  });

  it('does not fall through when META_API_KEY is set-but-empty', () => {
    vi.stubEnv('META_API_KEY', '');
    vi.stubEnv('META_AI_API_KEY', 'legacy-meta-key');
    expect(hasAnyProvider()).toBe(false);
  });

  it('hasAnyProvider() is false with no keys at all', () => {
    expect(hasAnyProvider()).toBe(false);
  });
});
