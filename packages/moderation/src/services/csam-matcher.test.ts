import { describe, it, expect } from 'vitest';
import { CSAMGuard } from './csam-matcher';

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

  it('returns not-matched when enabled (guard passthrough)', async () => {
    const guard = new CSAMGuard(true);
    const result = await guard.checkHash('abc123');
    expect(result).toEqual({ matched: false });
  });

  it('reports isEnabled correctly', () => {
    expect(new CSAMGuard(true).isEnabled()).toBe(true);
    expect(new CSAMGuard(false).isEnabled()).toBe(false);
  });
});
