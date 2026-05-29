import type { RemixInfo, EarningSplit } from '../types.js';

const DEFAULT_SPLIT: EarningSplit = {
  creator: 0.7,
  remixerChain: 0.2,
  platform: 0.1,
};

const SPLIT_EPSILON = 0.0001;

export class RemixManager {
  private readonly remixesByApp = new Map<string, RemixInfo>();

  fork(appId: string, originalAuthor: string, newAuthor: string): RemixInfo {
    const existing = this.remixesByApp.get(appId);
    const attributionChain = existing
      ? [...existing.attributionChain, existing.remixAuthor]
      : [originalAuthor];

    const remixId = `${appId}-remix-${Date.now()}`;
    const info: RemixInfo = {
      originalAppId: appId,
      originalAuthor,
      remixAuthor: newAuthor,
      attributionChain,
      createdAt: Date.now(),
    };

    // Store keyed by appId so subsequent forks can find the chain,
    // and also by remixId for direct attribution lookups
    this.remixesByApp.set(appId, info);
    this.remixesByApp.set(remixId, info);
    return info;
  }

  getAttribution(appId: string): string[] {
    const info = this.remixesByApp.get(appId);
    if (!info) return [];
    return info.attributionChain;
  }

  calculateEarnings(
    revenue: number,
    _split?: EarningSplit,
  ): {
    creatorAmount: number;
    remixerChainAmount: number;
    platformAmount: number;
  } {
    const split = _split ?? DEFAULT_SPLIT;
    const sum = split.creator + split.remixerChain + split.platform;
    if (Math.abs(sum - 1.0) > SPLIT_EPSILON) {
      throw new Error(`Earning split ratios must sum to 1.0, got ${sum}`);
    }
    return {
      creatorAmount: revenue * split.creator,
      remixerChainAmount: revenue * split.remixerChain,
      platformAmount: revenue * split.platform,
    };
  }
}
