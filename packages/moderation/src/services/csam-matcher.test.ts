import { describe, it, expect } from 'vitest';
import { CSAMGuard } from './csam-matcher';
import type { CSAMMatcherInterface } from '../types';

describe('CSAMGuard', () => {
  it('throws when media is not enabled', async () => {
    const guard = new CSAMGuard(false);
    await expect(guard.checkHash('abc123')).rejects.toThrow('CSAM matching not configured');
  });

  it('throws on reportMatch when not enabled', async () => {
    const guard = new CSAMGuard(false);
    await expect(guard.reportMatch({ hash: 'abc', source: 'upload' })).rejects.toThrow(
      'CSAM matching not configured',
    );
  });

  it('fails closed when enabled but no real matcher is configured (never declares safe)', async () => {
    const guard = new CSAMGuard(true);
    await expect(guard.checkHash('abc123')).rejects.toThrow('no real matcher is configured');
  });

  it('delegates to a real matcher when one is provided', async () => {
    const calls: string[] = [];
    const delegate: CSAMMatcherInterface = {
      async checkHash(hash) {
        calls.push(hash);
        return { matched: true, reportId: 'r1' };
      },
      async reportMatch() {},
    };
    const guard = new CSAMGuard(true, delegate);
    const result = await guard.checkHash('abc123');
    expect(result).toEqual({ matched: true, reportId: 'r1' });
    expect(calls).toEqual(['abc123']);
  });

  it('reports isEnabled correctly', () => {
    expect(new CSAMGuard(true).isEnabled()).toBe(true);
    expect(new CSAMGuard(false).isEnabled()).toBe(false);
  });
});
