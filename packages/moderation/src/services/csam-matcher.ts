// ============================================================================
// Moderation - CSAM Matcher
// Enforces that media uploads are blocked until a real CSAM matching
// partnership (PhotoDNA, Thorn Safer, etc.) is configured.
// ============================================================================

import type { CSAMMatcherInterface, CSAMHashProvider, CSAMReport } from '../types';

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: FAKE - applies to CSAMGuardLegacy only; CSAMMatchService below has real provider-based detection
 * Reason: Returns hardcoded {matched: false} with no real CSAM detection
 * Production path: Integrate PhotoDNA or Thorn Safer API
 *
 * CSAMGuardLegacy - Original guard implementation preserved for backward compat.
 *
 * If UGC_MEDIA_ENABLED is not set to 'true', all hash checks will throw,
 * preventing media uploads from being accepted without CSAM matching.
 */
export class CSAMGuardLegacy implements CSAMMatcherInterface {
  private readonly enabled: boolean;

  constructor(enabled?: boolean) {
    this.enabled = enabled ?? process.env['UGC_MEDIA_ENABLED'] === 'true';
  }

  async checkHash(_hash: string): Promise<{ matched: boolean; reportId?: string }> {
    if (!this.enabled) {
      throw new Error(
        'CSAM matching not configured. Media uploads are blocked until a real ' +
          'CSAM detection partnership (PhotoDNA, Thorn Safer) is integrated. ' +
          'Set UGC_MEDIA_ENABLED=true only after configuring a real provider.',
      );
    }
    return { matched: false };
  }

  async reportMatch(_params: { hash: string; source: string }): Promise<void> {
    if (!this.enabled) {
      throw new Error('CSAM matching not configured. Cannot report matches.');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

/** Backward-compatible alias */
export const CSAMGuard = CSAMGuardLegacy;

/** Interface for the paging webhook caller */
export interface PagingWebhookCaller {
  callWebhook(url: string, report: CSAMReport): Promise<void>;
}

/** Default paging webhook implementation using fetch */
const defaultPagingWebhook: PagingWebhookCaller = {
  async callWebhook(url: string, report: CSAMReport): Promise<void> {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
  },
};

/**
 * CSAMMatchService - Provider-based CSAM hash matching service.
 *
 * Accepts a CSAMHashProvider and performs hash checks with:
 * - Timeout enforcement (<500ms via AbortController pattern)
 * - On match: generates CSAMReport, calls paging webhook
 * - Fail-closed: if no provider configured (NullProvider), throws error
 */
export class CSAMMatchService implements CSAMMatcherInterface {
  private readonly provider: CSAMHashProvider;
  private readonly pagingWebhookUrl: string | undefined;
  private readonly timeoutMs: number;
  private readonly webhookCaller: PagingWebhookCaller;
  private readonly onReport?: (report: CSAMReport) => void;

  constructor(params: {
    provider: CSAMHashProvider;
    pagingWebhookUrl?: string;
    legalContactEmail?: string;
    timeoutMs?: number;
    webhookCaller?: PagingWebhookCaller;
    onReport?: (report: CSAMReport) => void;
  }) {
    this.provider = params.provider;
    this.pagingWebhookUrl = params.pagingWebhookUrl;
    this.timeoutMs = params.timeoutMs ?? 500;
    this.webhookCaller = params.webhookCaller ?? defaultPagingWebhook;
    this.onReport = params.onReport;
  }

  async checkHash(hash: string): Promise<{ matched: boolean; reportId?: string }> {
    // Enforce timeout - fail-closed on timeout (treat as match to block upload)
    const result = await this.withTimeout(this.provider.checkHash(hash), this.timeoutMs);

    if (result.matched) {
      const reportId = `csam_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const report: CSAMReport = {
        hash,
        source: 'upload_edge',
        timestamp: Date.now(),
        reportId,
        providerName: this.provider.getProviderName(),
        providerResponse: result.providerResponse,
      };

      // Emit report event
      if (this.onReport) {
        this.onReport(report);
      }

      // Call paging webhook (fire-and-forget, don't block on webhook failures)
      if (this.pagingWebhookUrl) {
        this.webhookCaller.callWebhook(this.pagingWebhookUrl, report).catch(() => {
          // Webhook failure should not prevent blocking the upload
        });
      }

      // Report to provider for their records
      await this.provider.reportMatch({
        hash,
        source: 'upload_edge',
        timestamp: Date.now(),
      });

      return { matched: true, reportId };
    }

    return { matched: false };
  }

  async reportMatch(params: { hash: string; source: string }): Promise<void> {
    await this.provider.reportMatch({
      hash: params.hash,
      source: params.source,
      timestamp: Date.now(),
    });
  }

  getProviderName(): string {
    return this.provider.getProviderName();
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`CSAM hash check timed out after ${ms}ms. Upload blocked (fail-closed).`));
      }, ms);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
