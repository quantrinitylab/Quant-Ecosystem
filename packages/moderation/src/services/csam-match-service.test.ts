import { describe, it, expect } from 'vitest';
import { CSAMMatchService, CSAMGuard, CSAMGuardLegacy } from './csam-matcher';
import { TestHashProvider, NullProvider, NCMEC_TEST_HASHES } from './csam-hash-provider';
import type { CSAMReport } from '../types';

describe('CSAMMatchService', () => {
  describe('with TestHashProvider', () => {
    it('rejects known NCMEC test hashes in <500ms', async () => {
      const provider = new TestHashProvider();
      const service = new CSAMMatchService({ provider });

      const knownHash = [...NCMEC_TEST_HASHES][0]!;

      const start = performance.now();
      const result = await service.checkHash(knownHash);
      const elapsed = performance.now() - start;

      expect(result.matched).toBe(true);
      expect(result.reportId).toBeDefined();
      expect(elapsed).toBeLessThan(500);
    });

    it('allows unknown hashes to pass through', async () => {
      const provider = new TestHashProvider();
      const service = new CSAMMatchService({ provider });

      const safeHash = 'f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0';
      const result = await service.checkHash(safeHash);

      expect(result.matched).toBe(false);
      expect(result.reportId).toBeUndefined();
    });

    it('generates CSAMReport with hash, source, timestamp on match', async () => {
      const reports: CSAMReport[] = [];
      const provider = new TestHashProvider();
      const service = new CSAMMatchService({
        provider,
        onReport: (report) => reports.push(report),
      });

      const knownHash = [...NCMEC_TEST_HASHES][1]!;
      const beforeTimestamp = Date.now();
      await service.checkHash(knownHash);

      expect(reports).toHaveLength(1);
      const report = reports[0]!;
      expect(report.hash).toBe(knownHash);
      expect(report.source).toBe('upload_edge');
      expect(report.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(report.reportId).toMatch(/^csam_/);
      expect(report.providerName).toBe('TestHashProvider');
    });

    it('calls paging webhook on match', async () => {
      const webhookCalls: { url: string; report: CSAMReport }[] = [];
      const provider = new TestHashProvider();
      const service = new CSAMMatchService({
        provider,
        pagingWebhookUrl: 'https://legal.example.com/csam-alert',
        webhookCaller: {
          async callWebhook(url: string, report: CSAMReport) {
            webhookCalls.push({ url, report });
          },
        },
      });

      const knownHash = [...NCMEC_TEST_HASHES][2]!;
      await service.checkHash(knownHash);

      // Give the fire-and-forget webhook a tick to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(webhookCalls).toHaveLength(1);
      expect(webhookCalls[0]!.url).toBe('https://legal.example.com/csam-alert');
      expect(webhookCalls[0]!.report.hash).toBe(knownHash);
    });

    it('does not call webhook for non-matching hashes', async () => {
      const webhookCalls: { url: string; report: CSAMReport }[] = [];
      const provider = new TestHashProvider();
      const service = new CSAMMatchService({
        provider,
        pagingWebhookUrl: 'https://legal.example.com/csam-alert',
        webhookCaller: {
          async callWebhook(url: string, report: CSAMReport) {
            webhookCalls.push({ url, report });
          },
        },
      });

      await service.checkHash('safe_hash_not_in_database');
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(webhookCalls).toHaveLength(0);
    });

    it('rejects all NCMEC test hashes', async () => {
      const provider = new TestHashProvider();
      const service = new CSAMMatchService({ provider });

      for (const hash of NCMEC_TEST_HASHES) {
        const result = await service.checkHash(hash);
        expect(result.matched).toBe(true);
      }
    });
  });

  describe('with NullProvider (fail-closed)', () => {
    it('throws error preventing media acceptance when no provider configured', async () => {
      const provider = new NullProvider();
      const service = new CSAMMatchService({ provider });

      await expect(service.checkHash('any_hash')).rejects.toThrow(
        'No CSAM hash provider configured',
      );
    });

    it('throws error on reportMatch', async () => {
      const provider = new NullProvider();
      const service = new CSAMMatchService({ provider });

      await expect(service.reportMatch({ hash: 'abc', source: 'test' })).rejects.toThrow(
        'No CSAM hash provider configured',
      );
    });
  });

  describe('timeout enforcement', () => {
    it('rejects with timeout error if provider takes too long', async () => {
      const slowProvider = {
        async checkHash(_hash: string) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { matched: false };
        },
        async reportMatch() {},
        getProviderName() {
          return 'SlowProvider';
        },
      };

      const service = new CSAMMatchService({
        provider: slowProvider,
        timeoutMs: 50,
      });

      await expect(service.checkHash('any_hash')).rejects.toThrow('timed out');
    });

    it('completes within timeout for fast providers', async () => {
      const provider = new TestHashProvider();
      const service = new CSAMMatchService({
        provider,
        timeoutMs: 500,
      });

      const safeHash = 'f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0';
      const result = await service.checkHash(safeHash);
      expect(result.matched).toBe(false);
    });
  });

  describe('webhook error resilience', () => {
    it('still blocks upload even if webhook fails', async () => {
      const provider = new TestHashProvider();
      const service = new CSAMMatchService({
        provider,
        pagingWebhookUrl: 'https://legal.example.com/csam-alert',
        webhookCaller: {
          async callWebhook() {
            throw new Error('Webhook unreachable');
          },
        },
      });

      const knownHash = [...NCMEC_TEST_HASHES][0]!;
      const result = await service.checkHash(knownHash);

      // Upload should still be blocked despite webhook failure
      expect(result.matched).toBe(true);
      expect(result.reportId).toBeDefined();
    });
  });
});

describe('CSAMGuard (backward compatibility)', () => {
  it('CSAMGuard is still exported and functional', () => {
    const guard = new CSAMGuard(true);
    expect(guard.isEnabled()).toBe(true);
  });

  it('CSAMGuardLegacy throws when not enabled', async () => {
    const guard = new CSAMGuardLegacy(false);
    await expect(guard.checkHash('abc')).rejects.toThrow('CSAM matching not configured');
  });

  it('CSAMGuardLegacy fails closed when enabled without a real matcher', async () => {
    const guard = new CSAMGuardLegacy(true);
    await expect(guard.checkHash('abc')).rejects.toThrow('no real matcher is configured');
  });

  it('CSAMGuardLegacy delegates to a real matcher when provided', async () => {
    const guard = new CSAMGuardLegacy(true, {
      async checkHash() {
        return { matched: false };
      },
      async reportMatch() {},
    });
    const result = await guard.checkHash('abc');
    expect(result).toEqual({ matched: false });
  });
});

describe('TestHashProvider', () => {
  it('accepts additional custom test hashes', async () => {
    const customHash = 'custom_test_hash_for_development_purposes_only_64chars_padded__';
    const provider = new TestHashProvider([customHash]);

    const result = await provider.checkHash(customHash);
    expect(result.matched).toBe(true);
  });

  it('still checks NCMEC test hashes with custom additions', async () => {
    const provider = new TestHashProvider(['custom_hash']);
    const ncmecHash = [...NCMEC_TEST_HASHES][0]!;

    const result = await provider.checkHash(ncmecHash);
    expect(result.matched).toBe(true);
  });
});

describe('NullProvider', () => {
  it('getProviderName returns NullProvider', () => {
    const provider = new NullProvider();
    expect(provider.getProviderName()).toBe('NullProvider');
  });
});
