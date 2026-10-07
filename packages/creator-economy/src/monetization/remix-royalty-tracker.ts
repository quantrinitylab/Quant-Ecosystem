import type { RemixRoyalty } from '../types.js';

interface OriginalContent {
  contentId: string;
  creatorId: string;
  royaltyPercent: number;
}

interface RemixRecord {
  remixId: string;
  originalContentId: string;
  remixerId: string;
  registeredAt: Date;
}

export class RemixRoyaltyTracker {
  private originals = new Map<string, OriginalContent>();
  private remixes: RemixRecord[] = [];
  private royalties: RemixRoyalty[] = [];

  registerOriginal(contentId: string, creatorId: string, royaltyPercent: number): void {
    this.originals.set(contentId, { contentId, creatorId, royaltyPercent });
  }

  recordRemix(remixId: string, originalContentId: string, remixerId: string): void {
    this.remixes.push({
      remixId,
      originalContentId,
      remixerId,
      registeredAt: new Date(),
    });
  }

  calculateRoyalties(period?: { start: Date; end: Date }): RemixRoyalty[] {
    let filtered = this.remixes;
    if (period) {
      filtered = filtered.filter(
        (r) => r.registeredAt >= period.start && r.registeredAt <= period.end,
      );
    }

    const calculated: RemixRoyalty[] = [];
    for (const remix of filtered) {
      const original = this.originals.get(remix.originalContentId);
      if (!original) continue;

      const royalty: RemixRoyalty = {
        originalCreatorId: original.creatorId,
        remixerId: remix.remixerId,
        originalContentId: remix.originalContentId,
        remixContentId: remix.remixId,
        royaltyPercent: original.royaltyPercent,
        earned: 0,
      };
      calculated.push(royalty);
    }

    this.royalties.push(...calculated);
    return calculated;
  }

  getChain(contentId: string): string[] {
    // Guard against self-loops / cyclic remix graphs which would otherwise
    // recurse forever and crash the process.
    const walk = (id: string, visited: Set<string>): string[] => {
      if (visited.has(id)) return [id];
      visited.add(id);

      const chain: string[] = [id];
      const remixesOfContent = this.remixes.filter((r) => r.originalContentId === id);
      for (const remix of remixesOfContent) {
        if (visited.has(remix.remixId)) continue;
        chain.push(remix.remixId);
        chain.push(...walk(remix.remixId, visited).slice(1));
      }
      return chain;
    };

    return walk(contentId, new Set<string>());
  }

  getOriginal(contentId: string): OriginalContent | undefined {
    return this.originals.get(contentId);
  }

  getRemixes(originalContentId: string): RemixRecord[] {
    return this.remixes.filter((r) => r.originalContentId === originalContentId);
  }
}
