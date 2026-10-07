// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { byteEnv } from '../lib/env-bytes';

const NAME = 'TEST_BYTE_ENV';

afterEach(() => {
  delete process.env[NAME];
  vi.restoreAllMocks();
});

describe('byteEnv', () => {
  it('uses the default when unset', () => {
    expect(byteEnv(NAME, 100)).toBe(100);
  });

  it.each(['', 'not-a-number', '-1', '1.5', String(Number.MAX_SAFE_INTEGER + 1)])(
    'uses the default and warns for invalid value %j',
    (value) => {
      process.env[NAME] = value;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(byteEnv(NAME, 100)).toBe(100);
      expect(warn).toHaveBeenCalledOnce();
    },
  );

  it('accepts a valid positive safe integer', () => {
    process.env[NAME] = '512';
    expect(byteEnv(NAME, 100)).toBe(512);
  });

  it('clamps values above the configured maximum and warns', () => {
    process.env[NAME] = '513';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(byteEnv(NAME, 100, 512)).toBe(512);
    expect(warn).toHaveBeenCalledOnce();
  });
});
