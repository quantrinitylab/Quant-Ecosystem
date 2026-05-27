// ============================================================================
// Moderation - CSAM Guard
// Enforces that media uploads are blocked until a real CSAM matching
// partnership (PhotoDNA, Thorn Safer, etc.) is configured.
// ============================================================================

import type { CSAMMatcherInterface } from '../types';

/**
 * CSAMGuard - Guards against shipping UGC without CSAM protection.
 *
 * If UGC_MEDIA_ENABLED is not set to 'true', all hash checks will throw,
 * preventing media uploads from being accepted without CSAM matching.
 * This ensures the system cannot accidentally go live without real
 * CSAM detection integrated.
 */
export class CSAMGuard implements CSAMMatcherInterface {
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
    // When enabled with a real provider, this would delegate to the provider.
    // For now, return not-matched as the guard itself is not a detector.
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
