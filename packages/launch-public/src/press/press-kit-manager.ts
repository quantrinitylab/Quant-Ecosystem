import type { PressCoverage, PressKit, PressRelease } from '../types.js';

export class PressKitManager {
  private kits = new Map<string, PressKit>();
  private releases: PressRelease[] = [];
  private coverage: PressCoverage[] = [];

  createKit(
    appName: string,
    description: string,
    logoUrls: string[],
    screenshotUrls: string[],
    stats: Record<string, number>,
  ): PressKit {
    const kit: PressKit = {
      id: crypto.randomUUID(),
      appName,
      description,
      logoUrls,
      screenshotUrls,
      stats,
      createdAt: Date.now(),
    };
    this.kits.set(kit.id, kit);
    return kit;
  }

  getKit(id: string): PressKit | null {
    return this.kits.get(id) ?? null;
  }

  scheduleRelease(title: string, embargoUntil: number | null): PressRelease {
    const release: PressRelease = {
      id: crypto.randomUUID(),
      title,
      embargoUntil,
      publishedAt: null,
      scheduled: embargoUntil !== null,
    };
    this.releases.push(release);
    return release;
  }

  publishRelease(releaseId: string): boolean {
    const release = this.releases.find((r) => r.id === releaseId);
    if (!release) return false;
    if (release.embargoUntil && Date.now() < release.embargoUntil) return false;
    release.publishedAt = Date.now();
    return true;
  }

  isUnderEmbargo(releaseId: string): boolean {
    const release = this.releases.find((r) => r.id === releaseId);
    if (!release || !release.embargoUntil) return false;
    return Date.now() < release.embargoUntil;
  }

  addCoverage(outlet: string, title: string, url: string, sentiment: number, reach: number): void {
    this.coverage.push({ outlet, title, url, sentiment, publishedAt: Date.now(), reach });
  }

  getCoverage(): PressCoverage[] {
    return [...this.coverage];
  }

  getCoverageByOutlet(outlet: string): PressCoverage[] {
    return this.coverage.filter((c) => c.outlet === outlet);
  }

  getAverageSentiment(): number {
    if (this.coverage.length === 0) return 0;
    return this.coverage.reduce((sum, c) => sum + c.sentiment, 0) / this.coverage.length;
  }

  getTotalReach(): number {
    return this.coverage.reduce((sum, c) => sum + c.reach, 0);
  }

  getRelease(id: string): PressRelease | null {
    return this.releases.find((r) => r.id === id) ?? null;
  }
}
