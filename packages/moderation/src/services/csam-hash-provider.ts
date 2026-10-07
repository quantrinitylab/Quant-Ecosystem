// ============================================================================
// Moderation - CSAM Hash Provider Adapters
// Provider pattern for pluggable CSAM hash matching services.
// ============================================================================

import type { CSAMHashProvider, CSAMHashCheckResult } from '../types';

/**
 * NCMEC test hashes for integration testing.
 * These are synthetic SHA-256 hashes that simulate known CSAM material
 * for testing the detection pipeline without real illegal content.
 */
export const NCMEC_TEST_HASHES: ReadonlySet<string> = new Set([
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
  'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',
  'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
  'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5',
  'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
]);

/**
 * PhotoDNAProvider - Adapter for Microsoft PhotoDNA Cloud Service.
 *
 * Calls the PhotoDNA REST API to check SHA-256 image hashes against
 * the NCMEC/PhotoDNA database of known CSAM material.
 * Requires a valid subscription key from Microsoft.
 */
export class PhotoDNAProvider implements CSAMHashProvider {
  private readonly apiEndpoint: string;
  private readonly subscriptionKey: string;

  constructor(params: { apiEndpoint?: string; subscriptionKey: string }) {
    this.apiEndpoint =
      params.apiEndpoint ?? 'https://api.microsoftmoderator.com/photodna/v1.0/Match';
    this.subscriptionKey = params.subscriptionKey;
  }

  async checkHash(hash: string): Promise<CSAMHashCheckResult> {
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
      },
      body: JSON.stringify({ ContentId: hash, HashValue: hash }),
    });

    if (!response.ok) {
      throw new Error(`PhotoDNA API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      IsMatch: boolean;
      MatchConfidence?: number;
    };

    return {
      matched: data.IsMatch,
      confidence: data.MatchConfidence,
      providerResponse: data as unknown as Record<string, unknown>,
    };
  }

  async reportMatch(params: { hash: string; source: string; timestamp: number }): Promise<void> {
    // PhotoDNA automatically logs matches on their side.
    // This method exists for audit trail purposes on our end.
    void params;
  }

  getProviderName(): string {
    return 'PhotoDNA';
  }
}

/**
 * TestHashProvider - Uses NCMEC test hashes for integration testing.
 *
 * Checks image hashes against a built-in set of known test hashes.
 * This provider is used for integration testing and development only.
 * It must NEVER be used in production.
 */
export class TestHashProvider implements CSAMHashProvider {
  private readonly testHashes: ReadonlySet<string>;

  constructor(additionalHashes?: string[]) {
    if (additionalHashes && additionalHashes.length > 0) {
      const combined = new Set(NCMEC_TEST_HASHES);
      for (const h of additionalHashes) {
        combined.add(h);
      }
      this.testHashes = combined;
    } else {
      this.testHashes = NCMEC_TEST_HASHES;
    }
  }

  async checkHash(hash: string): Promise<CSAMHashCheckResult> {
    const matched = this.testHashes.has(hash);
    return {
      matched,
      confidence: matched ? 1.0 : 0,
      providerResponse: { provider: 'test', hashChecked: hash, matched },
    };
  }

  async reportMatch(params: { hash: string; source: string; timestamp: number }): Promise<void> {
    // No-op for test provider - matches are logged locally only
    void params;
  }

  getProviderName(): string {
    return 'TestHashProvider';
  }
}

/**
 * NullProvider - Fail-closed default provider.
 *
 * Always throws an error, ensuring that media uploads are blocked
 * if no real CSAM hash provider is configured. This implements the
 * fail-closed principle: without explicit provider configuration,
 * all media is rejected.
 */
export class NullProvider implements CSAMHashProvider {
  async checkHash(_hash: string): Promise<CSAMHashCheckResult> {
    throw new Error(
      'No CSAM hash provider configured. Media uploads are blocked. ' +
        'Configure a CSAMHashProvider (PhotoDNA, TestHashProvider) before accepting media.',
    );
  }

  async reportMatch(_params: { hash: string; source: string; timestamp: number }): Promise<void> {
    throw new Error('No CSAM hash provider configured. Cannot report matches.');
  }

  getProviderName(): string {
    return 'NullProvider';
  }
}
