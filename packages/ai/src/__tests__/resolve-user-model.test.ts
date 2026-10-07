// ============================================================================
// Tests - Per-user model selection (resolveUserModel)
// ============================================================================

import { describe, it, expect } from 'vitest';

import {
  resolveUserModel,
  resolveUserModelDetailed,
  isModelAllowed,
} from '../providers/resolve-user-model';

const ALLOWED = [
  'openai/gpt-4o',
  'anthropic/claude-3.5-sonnet',
  'meta-llama/llama-3.1-70b-instruct',
] as const;
const DEFAULT = 'openai/gpt-4o-mini';

describe('resolveUserModel — with allow-list', () => {
  it('honors a preference that is on the allow-list', () => {
    expect(
      resolveUserModel('anthropic/claude-3.5-sonnet', { allowed: ALLOWED, default: DEFAULT }),
    ).toBe('anthropic/claude-3.5-sonnet');
  });

  it('falls back to the default for a preference not on the allow-list', () => {
    expect(resolveUserModel('totally/unknown-model', { allowed: ALLOWED, default: DEFAULT })).toBe(
      DEFAULT,
    );
  });

  it('falls back to the default when preference is null/undefined/blank', () => {
    expect(resolveUserModel(null, { allowed: ALLOWED, default: DEFAULT })).toBe(DEFAULT);
    expect(resolveUserModel(undefined, { allowed: ALLOWED, default: DEFAULT })).toBe(DEFAULT);
    expect(resolveUserModel('   ', { allowed: ALLOWED, default: DEFAULT })).toBe(DEFAULT);
  });

  it('trims whitespace around a valid preference', () => {
    expect(resolveUserModel('  openai/gpt-4o  ', { allowed: ALLOWED, default: DEFAULT })).toBe(
      'openai/gpt-4o',
    );
  });
});

describe('resolveUserModel — without allow-list', () => {
  it('honors any non-blank preference', () => {
    expect(resolveUserModel('some/custom-model', { default: DEFAULT })).toBe('some/custom-model');
  });

  it('uses the default for a blank/missing preference', () => {
    expect(resolveUserModel('', { default: DEFAULT })).toBe(DEFAULT);
    expect(resolveUserModel(undefined, { default: DEFAULT })).toBe(DEFAULT);
  });

  it('treats an empty allow-list the same as no allow-list', () => {
    expect(resolveUserModel('x/y', { allowed: [], default: DEFAULT })).toBe('x/y');
  });
});

describe('resolveUserModelDetailed — reports the resolution source', () => {
  it('reports "preference" when the preference is honored', () => {
    expect(
      resolveUserModelDetailed('openai/gpt-4o', { allowed: ALLOWED, default: DEFAULT }),
    ).toEqual({ model: 'openai/gpt-4o', source: 'preference' });
  });

  it('reports "default" when falling back', () => {
    expect(resolveUserModelDetailed('nope/nope', { allowed: ALLOWED, default: DEFAULT })).toEqual({
      model: DEFAULT,
      source: 'default',
    });
  });
});

describe('isModelAllowed', () => {
  it('permits everything when no allow-list is supplied', () => {
    expect(isModelAllowed('anything/at-all')).toBe(true);
    expect(isModelAllowed('anything/at-all', [])).toBe(true);
  });

  it('enforces membership when an allow-list is supplied', () => {
    expect(isModelAllowed('openai/gpt-4o', ALLOWED)).toBe(true);
    expect(isModelAllowed('unknown/model', ALLOWED)).toBe(false);
  });

  it('rejects blank/missing ids', () => {
    expect(isModelAllowed('', ALLOWED)).toBe(false);
    expect(isModelAllowed(null)).toBe(false);
    expect(isModelAllowed(undefined)).toBe(false);
  });
});
